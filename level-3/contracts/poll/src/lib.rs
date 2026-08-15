#![no_std]

use soroban_sdk::{contract, contractevent, contracterror, contractimpl, contracttype, Address, Env, String, Vec};

// Cross-contract call target: the Rewards contract, imported by its
// compiled wasm so we get a typed Client without a source dependency on
// the rewards crate. Built by `cargo build -p rewards --target
// wasm32v1-none --release` — see ../README.md for the full build order.
mod rewards_contract {
    soroban_sdk::contractimport!(file = "../target/wasm32v1-none/release/rewards.wasm");
}

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Admin,
    Question,
    Options,
    Votes,
    RewardsContract,
    Voted(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PollError {
    InvalidOption = 1,
    AlreadyVoted = 2,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VoteCast {
    #[topic]
    pub voter: Address,
    pub option_index: u32,
    pub new_count: u32,
}

#[contract]
pub struct PollContract;

#[contractimpl]
impl PollContract {
    /// Deployed by the Factory contract via `deploy_v2` (see
    /// ../factory/src/lib.rs) with these as constructor args — deployment
    /// and setup happen atomically, so there's no separate uninitialized
    /// state to worry about, unlike Level 2's poll which used a manual
    /// `initialize()` callable after deployment.
    pub fn __constructor(
        env: Env,
        admin: Address,
        question: String,
        options: Vec<String>,
        rewards_contract: Address,
    ) {
        admin.require_auth();

        let mut counts: Vec<u32> = Vec::new(&env);
        for _ in options.iter() {
            counts.push_back(0);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Question, &question);
        env.storage().instance().set(&DataKey::Options, &options);
        env.storage().instance().set(&DataKey::Votes, &counts);
        env.storage()
            .instance()
            .set(&DataKey::RewardsContract, &rewards_contract);
    }

    /// Casts one vote for `option_index` from `voter`, then calls the
    /// Rewards contract to credit that voter a point — the inter-contract
    /// call this project is built around. Cross-contract calls in Soroban
    /// aren't isolated: if the Rewards call panics (wrong address, Rewards
    /// contract missing, etc.) the whole transaction reverts, so the vote
    /// and the point credit are atomic — either both land or neither does.
    pub fn vote(env: Env, voter: Address, option_index: u32) -> Result<u32, PollError> {
        voter.require_auth();

        let voted_key = DataKey::Voted(voter.clone());
        if env.storage().persistent().has(&voted_key) {
            return Err(PollError::AlreadyVoted);
        }

        let options: Vec<String> = env.storage().instance().get(&DataKey::Options).unwrap();
        if option_index >= options.len() {
            return Err(PollError::InvalidOption);
        }

        let mut counts: Vec<u32> = env.storage().instance().get(&DataKey::Votes).unwrap();
        let new_count = counts.get(option_index).unwrap() + 1;
        counts.set(option_index, new_count);
        env.storage().instance().set(&DataKey::Votes, &counts);

        env.storage().persistent().set(&voted_key, &true);
        env.storage().persistent().extend_ttl(&voted_key, 100_000, 100_000);

        let rewards_address: Address = env
            .storage()
            .instance()
            .get(&DataKey::RewardsContract)
            .unwrap();
        let rewards_client = rewards_contract::Client::new(&env, &rewards_address);
        rewards_client.credit_point(&voter);

        VoteCast {
            voter,
            option_index,
            new_count,
        }
        .publish(&env);

        Ok(new_count)
    }

    pub fn get_question(env: Env) -> String {
        env.storage().instance().get(&DataKey::Question).unwrap()
    }

    pub fn get_options(env: Env) -> Vec<String> {
        env.storage().instance().get(&DataKey::Options).unwrap()
    }

    pub fn get_results(env: Env) -> Vec<u32> {
        env.storage().instance().get(&DataKey::Votes).unwrap()
    }

    pub fn has_voted(env: Env, voter: Address) -> bool {
        env.storage().persistent().has(&DataKey::Voted(voter))
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }

    pub fn get_rewards_contract(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::RewardsContract)
            .unwrap()
    }
}

#[cfg(test)]
mod test;
