#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events},
    vec, Env,
};

fn setup(env: &Env) -> (PollContractClient<'_>, Address) {
    let admin = Address::generate(env);
    let contract_id = env.register(PollContract, ());
    let client = PollContractClient::new(env, &contract_id);
    let question = String::from_str(env, "Best way to build on Stellar?");
    let options = vec![
        env,
        String::from_str(env, "Soroban smart contracts"),
        String::from_str(env, "Payments / DeFi"),
        String::from_str(env, "NFTs"),
    ];
    client.initialize(&admin, &question, &options);
    (client, admin)
}

#[test]
fn vote_increments_count_and_emits_event() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let voter = Address::generate(&env);
    let new_count = client.vote(&voter, &0);
    assert_eq!(new_count, 1);
    assert_eq!(env.events().all().events().len(), 1);

    let results = client.get_results();
    assert_eq!(results, vec![&env, 1, 0, 0]);
    assert!(client.has_voted(&voter));
}

#[test]
fn double_vote_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let voter = Address::generate(&env);
    client.vote(&voter, &1);
    let result = client.try_vote(&voter, &1);
    assert_eq!(result, Err(Ok(PollError::AlreadyVoted)));
}

#[test]
fn invalid_option_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin) = setup(&env);

    let voter = Address::generate(&env);
    let result = client.try_vote(&voter, &99);
    assert_eq!(result, Err(Ok(PollError::InvalidOption)));
}
