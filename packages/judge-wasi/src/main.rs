use regex::Regex;
use serde::de::{self, Deserialize, Deserializer, MapAccess, SeqAccess, Visitor};
use serde_json::{Map, Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeSet,
    fmt,
    io::{self, Read},
};

type R<T> = Result<T, String>;
const INPUT_LIMIT: usize = 4 * 1024 * 1024;
fn ensure(ok: bool, message: &str) -> R<()> {
    if ok { Ok(()) } else { Err(message.into()) }
}
fn text(v: &Value) -> R<&str> {
    v.as_str().ok_or("string required".into())
}
fn number(v: &Value, min: u64, max: u64) -> R<u64> {
    let n = v.as_u64().ok_or("unsigned integer required")?;
    ensure(n >= min && n <= max, "integer outside supported bounds")?;
    Ok(n)
}
fn array(v: &Value, min: usize, max: usize) -> R<&Vec<Value>> {
    let a = v.as_array().ok_or("array required")?;
    ensure(
        a.len() >= min && a.len() <= max,
        "array size outside supported bounds",
    )?;
    Ok(a)
}
fn keys(v: &Value, names: &[&str]) -> R<()> {
    let o = v.as_object().ok_or("object required")?;
    ensure(
        o.len() == names.len() && names.iter().all(|k| o.contains_key(*k)),
        "unexpected or missing field",
    )
}
fn matches(v: &Value, pattern: &str) -> R<()> {
    ensure(
        Regex::new(pattern).unwrap().is_match(text(v)?),
        "invalid identifier or digest",
    )
}
fn id(v: &Value) -> R<()> {
    matches(v, r"^[a-zA-Z0-9_-]{1,64}$")
}
fn account(v: &Value) -> R<()> {
    let s = text(v)?;
    ensure(s.len() >= 2 && s.len() <= 64, "invalid account length")?;
    matches(v, r"^[a-z0-9]+(?:[._-][a-z0-9]+)*$")
}
fn digest(v: &Value) -> R<()> {
    matches(v, r"^sha256:[a-f0-9]{64}$")
}
fn amount(v: &Value, max: u128) -> R<u128> {
    matches(v, r"^(0|[1-9][0-9]{0,38})$")?;
    let n = text(v)?.parse::<u128>().map_err(|_| "integer overflow")?;
    ensure(n <= max, "integer overflow")?;
    Ok(n)
}

// Reject duplicate keys at every depth, including escaped-key aliases.
struct Strict(Value);
impl<'de> Deserialize<'de> for Strict {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct V;
        impl<'de> Visitor<'de> for V {
            type Value = Strict;
            fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
                write!(f, "strict JSON")
            }
            fn visit_bool<E: de::Error>(self, v: bool) -> Result<Strict, E> {
                Ok(Strict(json!(v)))
            }
            fn visit_unit<E: de::Error>(self) -> Result<Strict, E> {
                Ok(Strict(Value::Null))
            }
            fn visit_str<E: de::Error>(self, v: &str) -> Result<Strict, E> {
                Ok(Strict(json!(v)))
            }
            fn visit_string<E: de::Error>(self, v: String) -> Result<Strict, E> {
                Ok(Strict(json!(v)))
            }
            fn visit_i64<E: de::Error>(self, v: i64) -> Result<Strict, E> {
                if !(-9007199254740991..=9007199254740991).contains(&v) {
                    return Err(E::custom("unsafe integer"));
                }
                Ok(Strict(json!(v)))
            }
            fn visit_u64<E: de::Error>(self, v: u64) -> Result<Strict, E> {
                if v > 9007199254740991 {
                    return Err(E::custom("unsafe integer"));
                }
                Ok(Strict(json!(v)))
            }
            fn visit_f64<E: de::Error>(self, _: f64) -> Result<Strict, E> {
                Err(E::custom("noncanonical JSON number"))
            }
            fn visit_seq<A: SeqAccess<'de>>(self, mut a: A) -> Result<Strict, A::Error> {
                let mut v = Vec::new();
                while let Some(x) = a.next_element::<Strict>()? {
                    v.push(x.0);
                }
                Ok(Strict(Value::Array(v)))
            }
            fn visit_map<A: MapAccess<'de>>(self, mut a: A) -> Result<Strict, A::Error> {
                let mut m = Map::new();
                while let Some(k) = a.next_key::<String>()? {
                    if m.contains_key(&k) {
                        return Err(de::Error::custom("duplicate JSON key"));
                    }
                    m.insert(k, a.next_value::<Strict>()?.0);
                }
                Ok(Strict(Value::Object(m)))
            }
        }
        d.deserialize_any(V)
    }
}
fn canonical(v: &Value, depth: usize) -> R<String> {
    ensure(depth <= 64, "JSON depth exceeds 64")?;
    match v {
        Value::Array(a) => Ok(format!(
            "[{}]",
            a.iter()
                .map(|x| canonical(x, depth + 1))
                .collect::<R<Vec<_>>>()?
                .join(",")
        )),
        Value::Object(o) => {
            let mut ks: Vec<_> = o.keys().collect();
            ks.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
            Ok(format!(
                "{{{}}}",
                ks.iter()
                    .map(|k| Ok(format!(
                        "{}:{}",
                        serde_json::to_string(k).unwrap(),
                        canonical(&o[*k], depth + 1)?
                    )))
                    .collect::<R<Vec<_>>>()?
                    .join(",")
            ))
        }
        _ => serde_json::to_string(v).map_err(|e| e.to_string()),
    }
}
fn parse(s: &str) -> R<Value> {
    let v = serde_json::from_str::<Strict>(s)
        .map_err(|e| e.to_string())?
        .0;
    canonical(&v, 0)?;
    Ok(v)
}
fn hash_bytes(s: &str) -> String {
    format!("sha256:{:x}", Sha256::digest(s.as_bytes()))
}
fn hash(v: &Value) -> R<String> {
    Ok(hash_bytes(&canonical(v, 0)?))
}

fn validate_agreement(a: &Value, now: u128) -> R<()> {
    keys(
        a,
        &[
            "schemaVersion",
            "network",
            "contractId",
            "orderId",
            "clientAccountId",
            "verifierAccountId",
            "asset",
            "totalAmountAtomic",
            "resultCutoffNs",
            "sourceManifestHash",
            "settlement",
            "failure",
            "tasks",
        ],
    )?;
    ensure(
        a["schemaVersion"] == "1.2"
            && a["network"] == "testnet"
            && a["asset"] == "NEAR"
            && a["settlement"] == "full_parent_success"
            && a["failure"] == "full_client_refund",
        "unsupported agreement",
    )?;
    for k in ["contractId", "clientAccountId", "verifierAccountId"] {
        account(&a[k])?;
    }
    id(&a["orderId"])?;
    digest(&a["sourceManifestHash"])?;
    let total = amount(&a["totalAmountAtomic"], u128::MAX)?;
    ensure(total > 0, "positive total required")?;
    ensure(
        amount(&a["resultCutoffNs"], u64::MAX as u128)? > now,
        "cutoff must be in future",
    )?;
    let tasks = array(&a["tasks"], 2, 5)?;
    let mut ids = BTreeSet::new();
    let mut sum = 0u128;
    for t in tasks {
        keys(
            t,
            &[
                "id",
                "agentId",
                "runtimeVersion",
                "recipientAccountId",
                "amountAtomic",
                "required",
                "dependsOn",
                "maxRevisions",
                "criteria",
                "verificationPolicyHash",
            ],
        )?;
        for k in ["id", "agentId", "runtimeVersion"] {
            id(&t[k])?;
        }
        account(&t["recipientAccountId"])?;
        digest(&t["verificationPolicyHash"])?;
        ensure(ids.insert(text(&t["id"])?), "duplicate task")?;
        let n = amount(&t["amountAtomic"], u128::MAX)?;
        ensure(n > 0, "positive allocation required")?;
        sum = sum.checked_add(n).ok_or("allocation overflow")?;
        ensure(t["required"] == true, "required tasks only")?;
        number(&t["maxRevisions"], 0, 3)?;
        let deps = array(&t["dependsOn"], 0, 4)?;
        let mut unique = BTreeSet::new();
        for d in deps {
            id(d)?;
            ensure(
                d != &t["id"] && unique.insert(text(d)?),
                "invalid dependency",
            )?;
        }
        let mut criteria = BTreeSet::new();
        for c in array(&t["criteria"], 1, 16)? {
            keys(c, &["id", "checker", "version"])?;
            id(&c["id"])?;
            ensure(criteria.insert(text(&c["id"])?), "duplicate criterion")?;
            ensure(
                c["version"] == 1
                    && [
                        "source_quote",
                        "total_cost",
                        "budget",
                        "delivery",
                        "selection",
                        "dependency_hash",
                    ]
                    .contains(&text(&c["checker"])?),
                "unknown checker",
            )?;
        }
    }
    ensure(sum == total, "allocation total mismatch")?;
    fn visit<'a>(
        key: &'a str,
        tasks: &'a [Value],
        active: &mut BTreeSet<&'a str>,
        done: &mut BTreeSet<&'a str>,
    ) -> R<()> {
        if done.contains(key) {
            return Ok(());
        }
        ensure(active.insert(key), "dependency cycle")?;
        let t = tasks
            .iter()
            .find(|t| t["id"] == key)
            .ok_or("unknown dependency")?;
        for d in t["dependsOn"].as_array().unwrap() {
            visit(text(d)?, tasks, active, done)?;
        }
        active.remove(key);
        done.insert(key);
        Ok(())
    }
    let mut active = BTreeSet::new();
    let mut done = BTreeSet::new();
    for t in tasks {
        visit(text(&t["id"])?, tasks, &mut active, &mut done)?;
    }
    ensure(
        tasks
            .iter()
            .any(|t| !t["dependsOn"].as_array().unwrap().is_empty()),
        "dependent workflow required",
    )
}
fn validate_sources(sources: &Value) -> R<()> {
    let mut ids = BTreeSet::new();
    for s in array(sources, 1, 20)? {
        keys(s, &["id", "text"])?;
        id(&s["id"])?;
        ensure(ids.insert(text(&s["id"])?), "duplicate source")?;
        let s = text(&s["text"])?;
        ensure(
            !s.trim().is_empty() && s.len() <= 100000,
            "invalid source text",
        )?;
    }
    Ok(())
}
fn validate_policy(p: &Value, t: &Value) -> R<()> {
    keys(
        p,
        &["schemaVersion", "taskId", "mode", "constraints", "criteria"],
    )?;
    ensure(
        p["schemaVersion"] == "2" && p["taskId"] == t["id"],
        "profile v2 required",
    )?;
    let mode = text(&p["mode"])?;
    ensure(
        ["extraction", "comparison"].contains(&mode),
        "unsupported mode",
    )?;
    ensure(
        t["dependsOn"].as_array().unwrap().len() == if mode == "extraction" { 0 } else { 1 },
        "unsupported dependency shape",
    )?;
    ensure(
        hash(p)? == text(&t["verificationPolicyHash"])? && p["criteria"] == t["criteria"],
        "policy commitment mismatch",
    )?;
    let c = &p["constraints"];
    keys(
        c,
        &["currency", "quantity", "budgetMinor", "maxDeliveryDays"],
    )?;
    matches(&c["currency"], r"^[A-Z]{3}$")?;
    number(&c["quantity"], 1, 1000000)?;
    amount(&c["budgetMinor"], u128::MAX)?;
    number(&c["maxDeliveryDays"], 0, 3650)?;
    let names: Vec<_> = p["criteria"]
        .as_array()
        .unwrap()
        .iter()
        .map(|c| text(&c["checker"]).unwrap())
        .collect();
    let required = if mode == "extraction" {
        vec!["source_quote", "total_cost"]
    } else {
        vec!["source_quote", "total_cost", "selection", "dependency_hash"]
    };
    ensure(
        required.iter().all(|k| names.contains(k)),
        "mandatory checker missing",
    )?;
    ensure(
        mode == "comparison"
            || names
                .iter()
                .all(|k| ["source_quote", "total_cost"].contains(k)),
        "comparison-only checker",
    )
}
fn artifact(bytes: &str, task: &str, version: u64) -> R<Value> {
    ensure(bytes.len() <= 1000000, "artifact too large")?;
    let a = parse(bytes)?;
    ensure(canonical(&a, 0)? == bytes, "noncanonical artifact")?;
    keys(
        &a,
        &[
            "schemaVersion",
            "taskId",
            "version",
            "inputArtifactHashes",
            "suppliers",
            "selectedSupplierId",
        ],
    )?;
    ensure(
        a["schemaVersion"] == "1" && a["taskId"] == task && a["version"] == version,
        "artifact identity mismatch",
    )?;
    let deps = a["inputArtifactHashes"]
        .as_object()
        .ok_or("dependency object required")?;
    ensure(deps.len() <= 4, "too many dependencies")?;
    for (k, v) in deps {
        id(&json!(k))?;
        digest(v)?;
    }
    let mut ids = BTreeSet::new();
    for s in array(&a["suppliers"], 1, 20)? {
        keys(
            s,
            &[
                "id",
                "sourceId",
                "quote",
                "unitPriceMinor",
                "quantity",
                "shippingMinor",
                "currency",
                "deliveryDays",
                "totalMinor",
            ],
        )?;
        id(&s["id"])?;
        id(&s["sourceId"])?;
        ensure(ids.insert(text(&s["id"])?), "duplicate supplier")?;
        let q = text(&s["quote"])?;
        ensure(!q.trim().is_empty() && q.len() <= 10000, "invalid quote")?;
        for k in ["unitPriceMinor", "shippingMinor", "totalMinor"] {
            amount(&s[k], u128::MAX)?;
        }
        number(&s["quantity"], 1, 1000000)?;
        matches(&s["currency"], r"^[A-Z]{3}$")?;
        if !s["deliveryDays"].is_null() {
            number(&s["deliveryDays"], 0, 3650)?;
        }
    }
    ensure(
        a["selectedSupplierId"].is_null() || ids.contains(text(&a["selectedSupplierId"])?),
        "invalid selection",
    )?;
    Ok(a)
}
fn verify(r: &Value) -> R<Value> {
    keys(
        r,
        &[
            "agreement",
            "approvedAgreementHash",
            "taskId",
            "policy",
            "sources",
            "artifactBytes",
            "revision",
            "evaluatedAtNs",
            "acceptedDependencies",
        ],
    )?;
    let now = amount(&r["evaluatedAtNs"], u64::MAX as u128)?;
    let a = &r["agreement"];
    validate_agreement(a, now)?;
    let ah = hash(a)?;
    digest(&r["approvedAgreementHash"])?;
    ensure(
        ah == text(&r["approvedAgreementHash"])?,
        "agreement hash mismatch",
    )?;
    id(&r["taskId"])?;
    let tasks = a["tasks"].as_array().unwrap();
    let task = tasks
        .iter()
        .find(|t| t["id"] == r["taskId"])
        .ok_or("unknown task")?;
    let revision = number(&r["revision"], 0, number(&task["maxRevisions"], 0, 3)?)?;
    let bytes = text(&r["artifactBytes"])?;
    ensure(bytes.len() <= 1000000, "artifact too large")?;
    let p = &r["policy"];
    validate_policy(p, task)?;
    let sources = &r["sources"];
    validate_sources(sources)?;
    ensure(
        hash(sources)? == text(&a["sourceManifestHash"])?,
        "source hash mismatch",
    )?;
    let deps = task["dependsOn"].as_array().unwrap();
    let supplied = array(&r["acceptedDependencies"], deps.len(), deps.len())?;
    let mut dep_hashes = Map::new();
    let mut predecessors = Vec::new();
    for d in supplied {
        keys(
            d,
            &[
                "orderId",
                "taskId",
                "agreementHash",
                "artifactHash",
                "artifactBytes",
            ],
        )?;
        ensure(
            d["orderId"] == a["orderId"] && d["agreementHash"] == ah,
            "cross-order dependency",
        )?;
        let key = text(&d["taskId"])?;
        ensure(
            deps.contains(&d["taskId"]) && !dep_hashes.contains_key(key),
            "unexpected dependency",
        )?;
        digest(&d["artifactHash"])?;
        let b = text(&d["artifactBytes"])?;
        ensure(
            b.len() <= 1000000 && hash_bytes(b) == text(&d["artifactHash"])?,
            "dependency hash mismatch",
        )?;
        let predecessor = tasks
            .iter()
            .find(|t| t["id"] == key)
            .ok_or("unknown predecessor")?;
        let parsed = parse(b)?;
        let version = number(
            &parsed["version"],
            1,
            number(&predecessor["maxRevisions"], 0, 3)? + 1,
        )?;
        predecessors.push(artifact(b, key, version)?);
        dep_hashes.insert(key.into(), d["artifactHash"].clone());
    }
    let mut checks = Vec::new();
    let mut add = |criterion: String, checker: &str, passed: bool| {
        checks.push(json!({"criterionId":criterion,"checker":checker,"passed":passed}));
    };
    let parsed = artifact(bytes, text(&task["id"])?, revision + 1);
    add("$schema".into(), "artifact_schema", parsed.is_ok());
    if let Ok(output) = parsed {
        let suppliers = output["suppliers"].as_array().unwrap();
        let c = &p["constraints"];
        let grammar=Regex::new(r"^[A-Za-z][A-Za-z0-9 _-]{0,63}: unit price (0|[1-9][0-9]{0,38}), shipping (0|[1-9][0-9]{0,38}), delivery (?:(0|[1-9][0-9]{0,3}) days|unknown)\.$").unwrap();
        for s in suppliers {
            let source = sources
                .as_array()
                .unwrap()
                .iter()
                .find(|v| v["id"] == s["sourceId"]);
            let matched = source.and_then(|v| grammar.captures(v["text"].as_str().unwrap()));
            let fact = matched.is_some_and(|m| {
                s["unitPriceMinor"] == m[1]
                    && s["shippingMinor"] == m[2]
                    && s["deliveryDays"]
                        == m.get(3)
                            .map_or(Value::Null, |v| json!(v.as_str().parse::<u64>().unwrap()))
                    && s["currency"] == c["currency"]
                    && s["quantity"] == c["quantity"]
            });
            add(
                format!("$source-facts:{}", text(&s["id"])?),
                "source_facts",
                fact,
            );
        }
        let mut actual: Vec<_> = suppliers.iter().map(|s| s["sourceId"].clone()).collect();
        let mut expected: Vec<_> = sources
            .as_array()
            .unwrap()
            .iter()
            .map(|s| s["id"].clone())
            .collect();
        actual.sort_by(|a, b| a.as_str().cmp(&b.as_str()));
        expected.sort_by(|a, b| a.as_str().cmp(&b.as_str()));
        add("$sources".into(), "source_coverage", actual == expected);
        let bound = output["inputArtifactHashes"] == Value::Object(dep_hashes);
        add("$dependencies".into(), "dependency_hash", bound);
        if p["mode"] == "extraction" {
            add(
                "$extraction".into(),
                "extraction_shape",
                output["selectedSupplierId"].is_null(),
            );
        } else {
            add(
                "$facts".into(),
                "dependency_facts",
                output["suppliers"] == predecessors[0]["suppliers"],
            );
        }
        let mut flags = Vec::new();
        let mut eligible_ids = Vec::new();
        for s in suppliers {
            let q = source_quote(s, sources);
            let cost = amount(&s["unitPriceMinor"], u128::MAX)?
                .checked_mul(number(&s["quantity"], 1, 1000000)? as u128)
                .and_then(|v| v.checked_add(amount(&s["shippingMinor"], u128::MAX).unwrap()));
            let total = cost == Some(amount(&s["totalMinor"], u128::MAX)?);
            let budget = total
                && s["currency"] == c["currency"]
                && s["quantity"] == c["quantity"]
                && cost.is_some_and(|v| v <= amount(&c["budgetMinor"], u128::MAX).unwrap());
            let delivery = s["deliveryDays"]
                .as_u64()
                .is_some_and(|v| v <= c["maxDeliveryDays"].as_u64().unwrap());
            if q && total && budget && delivery {
                eligible_ids.push(s["id"].clone());
            }
            flags.push((q, total, budget, delivery));
        }
        let selection = &output["selectedSupplierId"];
        let chosen = suppliers.iter().position(|s| s["id"] == *selection);
        let valid = if selection.is_null() {
            eligible_ids.is_empty()
        } else {
            eligible_ids.contains(selection)
        };
        for criterion in p["criteria"].as_array().unwrap() {
            let checker = text(&criterion["checker"])?;
            let key = text(&criterion["id"])?;
            match checker {
                "selection" => add(key.into(), checker, valid),
                "dependency_hash" => add(key.into(), checker, bound),
                "budget" | "delivery" => add(
                    key.into(),
                    checker,
                    if selection.is_null() {
                        eligible_ids.is_empty()
                    } else {
                        chosen.is_some_and(|i| {
                            if checker == "budget" {
                                flags[i].2
                            } else {
                                flags[i].3
                            }
                        })
                    },
                ),
                _ => {
                    for (i, s) in suppliers.iter().enumerate() {
                        add(
                            format!("{}:{}", key, text(&s["id"])?),
                            checker,
                            if checker == "source_quote" {
                                flags[i].0
                            } else {
                                flags[i].1
                            },
                        );
                    }
                }
            }
        }
    }
    let all = checks.iter().all(|c| c["passed"] == true);
    let decision = if all {
        "accepted"
    } else if revision < number(&task["maxRevisions"], 0, 3)? {
        "revision_required"
    } else {
        "rejected"
    };
    Ok(
        json!({"decision":decision,"checks":checks,"orderId":a["orderId"],"taskId":task["id"],"agreementHash":ah,"policyHash":hash(p)?,"sourceManifestHash":hash(sources)?,"artifactHash":hash_bytes(bytes),"artifactVersion":revision+1}),
    )
}
fn source_quote(s: &Value, sources: &Value) -> bool {
    sources.as_array().unwrap().iter().any(|v| {
        v["id"] == s["sourceId"]
            && v["text"]
                .as_str()
                .unwrap()
                .contains(s["quote"].as_str().unwrap())
    })
}
fn run(bytes: &str) -> R<Value> {
    let wrapper = parse(bytes)?;
    keys(
        &wrapper,
        &["inputBytes", "expectedInputHash", "expectedCodeHash"],
    )?;
    let input_bytes = text(&wrapper["inputBytes"])?;
    ensure(input_bytes.len() <= INPUT_LIMIT, "judge input too large")?;
    digest(&wrapper["expectedInputHash"])?;
    digest(&wrapper["expectedCodeHash"])?;
    ensure(
        hash_bytes(input_bytes) == text(&wrapper["expectedInputHash"])?,
        "input commitment mismatch",
    )?;
    let input = parse(input_bytes)?;
    ensure(
        canonical(&input, 0)? == input_bytes,
        "noncanonical judge request",
    )?;
    keys(
        &input,
        &["schemaVersion", "requestId", "codeHash", "verification"],
    )?;
    ensure(
        input["schemaVersion"] == "1" && input["codeHash"] == wrapper["expectedCodeHash"],
        "protocol/code mismatch",
    )?;
    id(&input["requestId"])?;
    let result = json!({"schemaVersion":"1","execution":"local-wasi-not-attested","requestId":input["requestId"],"inputHash":wrapper["expectedInputHash"],"codeHash":wrapper["expectedCodeHash"],"verification":verify(&input["verification"] )?,"attested":false,"settlementAuthorized":false});
    Ok(json!({"outputHash":hash(&result)?,"result":result}))
}
fn main() {
    let mut bytes = Vec::new();
    if io::stdin()
        .take((16 * 1024 * 1024 + 1) as u64)
        .read_to_end(&mut bytes)
        .is_err()
        || bytes.len() > 16 * 1024 * 1024
    {
        eprintln!("bounded input required");
        std::process::exit(1);
    }
    let result = std::str::from_utf8(&bytes)
        .map_err(|_| "invalid UTF-8".to_string())
        .and_then(run);
    match result {
        Ok(value) => println!("{}", serde_json::to_string(&value).unwrap()),
        Err(message) => {
            eprintln!("judge rejected input: {message}");
            std::process::exit(1);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn duplicate_keys_fail() {
        assert!(parse(r#"{"x":1,"\u0078":2}"#).is_err());
    }
    #[test]
    fn unsafe_numbers_fail() {
        assert!(parse("9007199254740992").is_err());
        assert!(parse("-0").is_err());
    }
    #[test]
    fn canonical_utf16_order() {
        assert_eq!(
            canonical(&json!({"b":2,"a":1}), 0).unwrap(),
            r#"{"a":1,"b":2}"#
        );
    }
    #[test]
    fn monetary_bounds() {
        assert!(amount(&json!(u128::MAX.to_string()), u128::MAX).is_ok());
        assert!(amount(&json!("01"), u128::MAX).is_err());
    }
}
