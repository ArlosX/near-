//! DCAP's supported Config extension: retain audited certificate/DER logic;
//! delegate SHA-256 and P-256 signature verification to NEAR host functions.
use dcap_qvl::config::{Config, CryptoProvider};
use p256::elliptic_curve::sec1::ToEncodedPoint;
use rustls_pki_types::{
    AlgorithmIdentifier, InvalidSignature, SignatureVerificationAlgorithm, alg_id,
};

#[derive(Debug)]
struct NearP256;
impl SignatureVerificationAlgorithm for NearP256 {
    fn public_key_alg_id(&self) -> AlgorithmIdentifier {
        alg_id::ECDSA_P256
    }
    fn signature_alg_id(&self) -> AlgorithmIdentifier {
        alg_id::ECDSA_SHA256
    }
    fn verify_signature(
        &self,
        public_key: &[u8],
        message: &[u8],
        signature: &[u8],
    ) -> Result<(), InvalidSignature> {
        // Parse and validate the full SEC1 point before compressing it: merely
        // keeping X and the Y parity would ignore an invalid uncompressed Y.
        let key = p256::PublicKey::from_sec1_bytes(public_key).map_err(|_| InvalidSignature)?;
        let point = key.to_encoded_point(true);
        let compressed: &[u8; 33] = point.as_bytes().try_into().map_err(|_| InvalidSignature)?;
        let signature =
            p256::ecdsa::Signature::from_der(signature).map_err(|_| InvalidSignature)?;
        let raw: [u8; 64] = signature.to_bytes().into();
        if near_sdk::env::p256_verify(&raw, &near_sdk::env::sha256_array(message), compressed) {
            Ok(())
        } else {
            Err(InvalidSignature)
        }
    }
}
pub struct NearCrypto;
impl CryptoProvider for NearCrypto {
    fn sig_algo() -> &'static dyn SignatureVerificationAlgorithm {
        &NearP256
    }
    fn sha256(data: &[u8]) -> [u8; 32] {
        near_sdk::env::sha256_array(data)
    }
}
pub struct NearConfig;
impl Config for NearConfig {
    type X509 = dcap_qvl::x509::X509CertBackend;
    type SigEncoder = dcap_qvl::signature::DerSigEncoder;
    type Crypto = NearCrypto;
}
