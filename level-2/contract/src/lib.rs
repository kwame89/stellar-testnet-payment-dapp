#![no_std]

use soroban_sdk::{contract, contracterror, contractimpl, contracttype, symbol_short, Address, Env, String, Vec};

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Admin,
    Question,
    Options,
    Votes,
    Initialized,
    Voted(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PollError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidOption = 3,
    AlreadyVoted = 4,
}

#[contract]
pub struct PollContract;

#[contractimpl]
impl PollContract {
    /// One-time setup: sets the poll question, its options, and zeroes the vote counts.
    pub fn initialize(env: Env, admin: Address, question: String, options: Vec<String>) -> Result<(), PollError> {
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(PollError::AlreadyInitialized);
        }
        admin.require_auth();

        let mut counts: Vec<u32> = Vec::new(&env);
        for _ in options.iter() {
            counts.push_back(0);
        }

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Question, &question);
        env.storage().instance().set(&DataKey::Options, &options);
        env.storage().instance().set(&DataKey::Votes, &counts);
        env.storage().instance().set(&DataKey::Initialized, &true);

        Ok(())
    }

    /// Casts one vote for `option_index` from `voter`. Each address may vote once.
    pub fn vote(env: Env, voter: Address, option_index: u32) -> Result<u32, PollError> {
        voter.require_auth();

        if !env.storage().instance().has(&DataKey::Initialized) {
            return Err(PollError::NotInitialized);
        }

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

        env.events()
            .publish((symbol_short!("vote"), voter), (option_index, new_count));

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
}

#[cfg(test)]
mod test;
