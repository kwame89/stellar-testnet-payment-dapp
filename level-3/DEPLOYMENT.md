# Level 3 deployment record (Stellar Testnet)

Deployer account: `GC42GRZLWBQIEQMDMH4SLQX7ODT4WSKGMNVEMYUWE2IKU5AARQ24QSHJ`

## Contracts

| Contract | Address / Hash |
|---|---|
| Rewards contract ID | `CCA66JVPGXTGSY7DKB5FR6TKD2XO3UE4K5FNOBTDNXQUU55IZET6QUKY` |
| Rewards wasm hash | `355ac5724ef4f0267672d67d56ee7fc3558bc8f5ede02d4c9743b3d2136dbabb` |
| Poll wasm hash (used by Factory's deploy_v2, not deployed standalone) | `a432886259554a4ce62b12caee2ecb5add044143ec6b2afb9e4575eb54093374` |
| Factory contract ID | `CB3J4TMTKHORFXGLMSAFYZRZXD6PTSJSX4QCR3H7CDYC2ZMHQZIFHORU` |
| Factory wasm hash | `573d518d647a92c06f396ccff508ebc06fb8a7aa0bc3555e91aad024094f6907` |
| First live poll (created via factory.create_poll) | `CA6ZF5MBEC7XJ6AEDPWBAYLXKZNGF6VWJBESGPMVJ6WPNV2M4FPHIROH` |

## Transaction hashes

| Action | Tx hash |
|---|---|
| Upload Rewards wasm | [`221b422ded7b1155de60f311901f72021fb777d14e4a6de43290a0a0a3d3d731`](https://stellar.expert/explorer/testnet/tx/221b422ded7b1155de60f311901f72021fb777d14e4a6de43290a0a0a3d3d731) |
| Deploy + construct Rewards | [`2fe813864f96254d85ead82b81357ec9af65fe67a90a4d0c3674ed4104a630e8`](https://stellar.expert/explorer/testnet/tx/2fe813864f96254d85ead82b81357ec9af65fe67a90a4d0c3674ed4104a630e8) |
| Upload Poll wasm | [`2eaaf08f844bc8035a71cfd40e9ec0be187caab161434c996f06fec90fe1bbc9`](https://stellar.expert/explorer/testnet/tx/2eaaf08f844bc8035a71cfd40e9ec0be187caab161434c996f06fec90fe1bbc9) |
| Upload + deploy Factory | [`b1d4a8e95538d05f6f52b2fbef621d69fc716d3532fae0d3abdb43c0191c6d5a`](https://stellar.expert/explorer/testnet/tx/b1d4a8e95538d05f6f52b2fbef621d69fc716d3532fae0d3abdb43c0191c6d5a) |
| Construct Factory | [`e61dd60ed01a9a41e4f65b484a736d57443b546ff6caa80d4608d890244c14a4`](https://stellar.expert/explorer/testnet/tx/e61dd60ed01a9a41e4f65b484a736d57443b546ff6caa80d4608d890244c14a4) |
| `create_poll` (Factory deploys a live Poll instance — inter-contract call #1) | [`d09e9668c3d48578ff934c5aa1ee616072ef439deaa4d6531b63d93bb17e0153`](https://stellar.expert/explorer/testnet/tx/d09e9668c3d48578ff934c5aa1ee616072ef439deaa4d6531b63d93bb17e0153) |
| `vote` (Poll calls Rewards.credit_point — inter-contract call #2; emits both `point_credited` and `vote_cast` events) | [`8899ea356bb6660496bce0da315d643d77265a9c051e2a3b07e2986e0eec0a3b`](https://stellar.expert/explorer/testnet/tx/8899ea356bb6660496bce0da315d643d77265a9c051e2a3b07e2986e0eec0a3b) |

## Local TLS note

`soroban-testnet.stellar.org` was intermittently serving an incomplete
certificate chain (2 certs instead of 3 — missing the Sectigo intermediate)
during this deployment, which broke `stellar-cli`'s TLS handshake locally.
Worked around by adding the missing intermediate to the local login keychain
(`security add-trusted-cert -r trustAsRoot -k ~/Library/Keychains/login.keychain-db
/path/to/sectigo-intermediate.pem`) — a server-side issue, not a project bug,
noted here in case CI hits the same thing.
