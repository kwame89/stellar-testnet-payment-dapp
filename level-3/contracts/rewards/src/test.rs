#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Events};

fn setup(env: &Env) -> (RewardsContractClient<'_>, Address) {
    let admin = Address::generate(env);
    let contract_id = env.register(RewardsContract, RewardsContractArgs::__constructor(&admin));
    let client = RewardsContractClient::new(env, &contract_id);
    (client, admin)
}

#[test]
fn credit_point_starts_at_one_and_increments() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    let voter = Address::generate(&env);

    let first = client.credit_point(&voter);
    assert_eq!(first, 1);
    let second = client.credit_point(&voter);
    assert_eq!(second, 2);
    assert_eq!(client.get_points(&voter), 2);
}

#[test]
fn different_voters_have_independent_points() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    let voter_a = Address::generate(&env);
    let voter_b = Address::generate(&env);

    client.credit_point(&voter_a);
    assert_eq!(client.get_points(&voter_a), 1);
    assert_eq!(client.get_points(&voter_b), 0);
}

#[test]
fn credit_point_emits_event() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    let voter = Address::generate(&env);

    client.credit_point(&voter);
    assert_eq!(env.events().all().events().len(), 1);
}

#[test]
fn admin_is_recorded_at_construction() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    assert_eq!(client.get_admin(), admin);
}
