#![no_std]

use soroban_sdk::{
    contract, contractevent, contractimpl, contracttype, Address, BytesN, Env, IntoVal, String,
    Val, Vec,
};

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Admin,
    PollWasmHash,
    Polls,
    PollCount,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PollCreated {
    #[topic]
    pub creator: Address,
    pub poll_address: Address,
}

#[contract]
pub struct FactoryContract;

#[contractimpl]
impl FactoryContract {
    /// `poll_wasm_hash` comes from `stellar contract upload` against the
    /// compiled Poll contract wasm (see ../README.md) — the factory only
    /// ever needs the hash to deploy new instances from, not the wasm
    /// itself, so there's no build-order dependency on the poll crate here.
    pub fn __constructor(env: Env, admin: Address, poll_wasm_hash: BytesN<32>) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::PollWasmHash, &poll_wasm_hash);
        env.storage()
            .instance()
            .set(&DataKey::Polls, &Vec::<Address>::new(&env));
        env.storage().instance().set(&DataKey::PollCount, &0u32);
    }

    /// Deploys a brand-new Poll contract instance backed by
    /// `rewards_contract`, initialized atomically via its constructor
    /// (deploy_v2 invokes the new instance's __constructor with these same
    /// args), and registers it in this factory's list. Returns the new
    /// poll's address. This is the second inter-contract mechanism this
    /// project demonstrates — Factory deploying and wiring up Poll,
    /// distinct from Poll calling Rewards at vote time.
    pub fn create_poll(
        env: Env,
        creator: Address,
        question: String,
        options: Vec<String>,
        rewards_contract: Address,
    ) -> Address {
        creator.require_auth();

        let wasm_hash: BytesN<32> = env
            .storage()
            .instance()
            .get(&DataKey::PollWasmHash)
            .unwrap();

        // A fresh salt per poll — deploy addresses are deterministic from
        // (deployer address, salt), so reusing a salt would collide.
        let count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::PollCount)
            .unwrap_or(0);
        let mut salt_bytes = [0u8; 32];
        salt_bytes[0..4].copy_from_slice(&count.to_be_bytes());
        let salt = BytesN::from_array(&env, &salt_bytes);

        let constructor_args: Vec<Val> =
            (creator.clone(), question, options, rewards_contract).into_val(&env);

        let poll_address = env
            .deployer()
            .with_address(env.current_contract_address(), salt)
            .deploy_v2(wasm_hash, constructor_args);

        let mut polls: Vec<Address> = env.storage().instance().get(&DataKey::Polls).unwrap();
        polls.push_back(poll_address.clone());
        env.storage().instance().set(&DataKey::Polls, &polls);
        env.storage()
            .instance()
            .set(&DataKey::PollCount, &(count + 1));

        PollCreated {
            creator,
            poll_address: poll_address.clone(),
        }
        .publish(&env);

        poll_address
    }

    pub fn list_polls(env: Env) -> Vec<Address> {
        env.storage().instance().get(&DataKey::Polls).unwrap()
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn get_poll_wasm_hash(env: Env) -> BytesN<32> {
        env.storage()
            .instance()
            .get(&DataKey::PollWasmHash)
            .unwrap()
    }
}

#[cfg(test)]
mod test;
