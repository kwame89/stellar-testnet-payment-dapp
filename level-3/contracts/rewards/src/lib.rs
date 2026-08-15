#![no_std]

use soroban_sdk::{contract, contractevent, contractimpl, contracttype, Address, Env};

#[derive(Clone)]
#[contracttype]
enum DataKey {
    Admin,
    Points(Address),
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PointCredited {
    #[topic]
    pub voter: Address,
    pub new_total: u32,
}

#[contract]
pub struct RewardsContract;

#[contractimpl]
impl RewardsContract {
    /// Records `admin`, deployed once per Rewards instance. `admin` isn't
    /// used to gate `credit_point` today — see that function's doc comment.
    pub fn __constructor(env: Env, admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Credits `voter` one point and returns their new total. This is the
    /// function the Poll contract calls on every vote (poll/src/lib.rs) —
    /// the cross-contract call this project is built around.
    ///
    /// Deliberately open to any caller, not restricted to a specific Poll
    /// or Factory address: Soroban gives a called contract no built-in way
    /// to verify which contract is calling it (there's no msg.sender
    /// equivalent propagated automatically), and building a real allowlist
    /// would mean the caller self-reporting its own identity as a plain
    /// argument, which is not meaningfully more secure than leaving this
    /// open. A production points economy would need a stronger model
    /// (e.g. a signed capability, or a fixed 1:1 Poll<->Rewards pairing
    /// established at deploy time and checked another way) — out of scope
    /// for what this project needs to demonstrate.
    pub fn credit_point(env: Env, voter: Address) -> u32 {
        let key = DataKey::Points(voter.clone());
        let current: u32 = env.storage().persistent().get(&key).unwrap_or(0);
        let new_total = current + 1;
        env.storage().persistent().set(&key, &new_total);
        env.storage().persistent().extend_ttl(&key, 100_000, 100_000);

        PointCredited { voter, new_total }.publish(&env);

        new_total
    }

    pub fn get_points(env: Env, voter: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::Points(voter))
            .unwrap_or(0)
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage().instance().get(&DataKey::Admin).unwrap()
    }
}

#[cfg(test)]
mod test;
