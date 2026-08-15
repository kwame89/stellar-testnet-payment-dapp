#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events},
    vec, Env,
};

fn setup(env: &Env) -> (PollContractClient<'_>, Address, Address) {
    let admin = Address::generate(env);
    let rewards_admin = Address::generate(env);

    let rewards_id = env.register(rewards_contract::WASM, (rewards_admin.clone(),));

    let question = String::from_str(env, "Best way to build on Stellar?");
    let options = vec![
        env,
        String::from_str(env, "Soroban smart contracts"),
        String::from_str(env, "Payments / DeFi"),
        String::from_str(env, "NFTs"),
    ];

    let contract_id = env.register(
        PollContract,
        (admin.clone(), question.clone(), options.clone(), rewards_id.clone()),
    );
    let client = PollContractClient::new(env, &contract_id);

    (client, admin, rewards_id)
}

#[test]
fn vote_increments_count_and_emits_event() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _rewards_id) = setup(&env);

    let voter = Address::generate(&env);
    let new_count = client.vote(&voter, &0);
    assert_eq!(new_count, 1);

    let results = client.get_results();
    assert_eq!(results, vec![&env, 1, 0, 0]);
    assert!(client.has_voted(&voter));
}

#[test]
fn vote_credits_a_point_via_the_rewards_contract() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, rewards_id) = setup(&env);
    let rewards_client = rewards_contract::Client::new(&env, &rewards_id);

    let voter = Address::generate(&env);
    client.vote(&voter, &0);

    assert_eq!(rewards_client.get_points(&voter), 1);
}

#[test]
fn double_vote_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _rewards_id) = setup(&env);

    let voter = Address::generate(&env);
    client.vote(&voter, &1);
    let result = client.try_vote(&voter, &1);
    assert_eq!(result, Err(Ok(PollError::AlreadyVoted)));
}

#[test]
fn invalid_option_is_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _rewards_id) = setup(&env);

    let voter = Address::generate(&env);
    let result = client.try_vote(&voter, &99);
    assert_eq!(result, Err(Ok(PollError::InvalidOption)));
}

#[test]
fn vote_emits_events_from_both_poll_and_rewards() {
    let env = Env::default();
    env.mock_all_auths();
    let (client, _admin, _rewards_id) = setup(&env);

    let voter = Address::generate(&env);
    client.vote(&voter, &0);

    // One event from PollContract's VoteCast, one from Rewards' PointCredited.
    assert_eq!(env.events().all().events().len(), 2);
}
