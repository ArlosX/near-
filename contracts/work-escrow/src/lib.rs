#[cfg(target_arch = "wasm32")]
mod contract;
#[cfg(target_arch = "wasm32")]
mod near_crypto;
pub mod state;
#[cfg(target_arch = "wasm32")]
mod tee;
