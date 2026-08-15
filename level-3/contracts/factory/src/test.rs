#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events},
    vec, Env,
};

// Test-only: the production factory contract never embeds Poll's wasm (it
// only stores a hash — see lib.rs), but tests need real wasm bytes to
// upload and deploy from, the same way factory's real deployment flow
// starts with `stellar contract upload`.
mod poll_contract {
    soroban_sdk::contractimport!(file = "../target/wasm32v1-none/release/poll.wasm");
}
mod rewards_contract {
    soroban_sdk::contractimport!(file = "../target/wasm32v1-none/release/rewards.wasm");
}

fn setup(env: &Env) -> (FactoryContractClient<'_>, Address, Address) {
    let admin = Address::generate(env);
    let rewards_admin = Address::generate(env);

    let rewards_id = env.register(rewards_contract::WASM, (rewards_admin,));
    let poll_wasm_hash = env.deployer().upload_contract_wasm(poll_contract::WASM);

    let contract_id = env.register(FactoryContract, (admin.clone(), poll_wasm_hash));
    let client = FactoryContractClient::new(env, &contract_id);

    (client, admin, rewards_id)
}

#[test]
fn create_poll_deploys_a_working_poll_instance() {
    let env = Env::default();
    env.mock_all_auths();
    let (factory, _admin, rewards_id) = setup(&env);

    let creator = Address::generate(&env);
    let question = String::from_str(&env, "Best way to build on Stellar?");
    let options = vec![
        &env,
        String::from_str(&env, "Soroban smart contracts"),
        String::from_str(&env, "Payments / DeFi"),
    ];

    let poll_address = factory.create_poll(&creator, &question, &options, &rewards_id);

    let poll_client = poll_contract::Client::new(&env, &poll_address);
    assert_eq!(poll_client.get_question(), question);
    assert_eq!(poll_client.get_admin(), creator);

    let voter = Address::generate(&env);
    let new_count = poll_client.vote(&voter, &0);
    assert_eq!(new_count, 1);

    // Proves the deployed poll was wired up with the real rewards contract,
    // not just constructed — the vote's cross-contract call actually landed.
    let rewards_client = rewards_contract::Client::new(&env, &rewards_id);
    assert_eq!(rewards_client.get_points(&voter), 1);
}

#[test]
fn list_polls_grows_with_each_creation() {
    let env = Env::default();
    env.mock_all_auths();
    let (factory, _admin, rewards_id) = setup(&env);

    assert_eq!(factory.list_polls().len(), 0);

    let creator = Address::generate(&env);
    let question = String::from_str(&env, "Q1");
    let options = vec![&env, String::from_str(&env, "A"), String::from_str(&env, "B")];
    factory.create_poll(&creator, &question, &options, &rewards_id);
    assert_eq!(factory.list_polls().len(), 1);

    factory.create_poll(&creator, &question, &options, &rewards_id);
    assert_eq!(factory.list_polls().len(), 2);
}

#[test]
fn each_created_poll_has_a_distinct_address() {
    let env = Env::default();
    env.mock_all_auths();
    let (factory, _admin, rewards_id) = setup(&env);

    let creator = Address::generate(&env);
    let question = String::from_str(&env, "Q1");
    let options = vec![&env, String::from_str(&env, "A"), String::from_str(&env, "B")];

    let first = factory.create_poll(&creator, &question, &options, &rewards_id);
    let second = factory.create_poll(&creator, &question, &options, &rewards_id);
    assert_ne!(first, second);
}

#[test]
fn create_poll_emits_an_event() {
    let env = Env::default();
    env.mock_all_auths();
    let (factory, _admin, rewards_id) = setup(&env);

    let creator = Address::generate(&env);
    let question = String::from_str(&env, "Q1");
    let options = vec![&env, String::from_str(&env, "A"), String::from_str(&env, "B")];
    factory.create_poll(&creator, &question, &options, &rewards_id);

    assert_eq!(env.events().all().events().len(), 1);
}
