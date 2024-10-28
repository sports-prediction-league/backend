# SPL

The SPL (Sports Prediction League) Backend serves as the core engine for managing sports predictions. It automates the fetching of upcoming matches, stores relevant data, and updates results. By integrating with starknet, it facilitates the registration of matches on-chain, allowing users to make predictions through a smart contract. Additionally, a Telegram bot enhances user engagement with real-time notifications and easy access to commands.

## Features

- **Automated Match Fetching**: Retrieves upcoming matches daily and stores them in a PostgreSQL database.
- **On-Chain Match Registration**: Registers each stored match on StarkNet, enabling users to submit their predictions directly via the smart contract.
- **Score Updates**: Identifies finished matches, updates scores in the database, and triggers a smart contract function to record updated results on-chain for matches that haven’t yet been scored.
- **Current Round Fetch**: Exposes an API endpoint to retrieve matches by round, defaulting to the current round.
- **Telegram Bot Integration**: Supports commands, notifications, and profile handling:
  - **Commands**:
    - `/top`: Retrieves the leaderboard showing top user.
    - `/my_points`: Displays the user’s current points.
  - **Notifications**:
    - Notifies users of newly added matches.
    - Updates users on score changes for completed matches.
  - **Profile Handling**: Fetches and displays users' Telegram profile pictures, enhancing the platform’s user experience.

## Tech Stack

- **Node.js**: Runtime environment for server-side code.
- **Express**: Web framework for the REST API.
- **PostgreSQL**: Database for storing match data.
- **Sequelize**: ORM for database operations.
- **node-cron**: Scheduling library for automated tasks.
- **starknetjs**: For interacting with the starknet smart contract.
- **Telegram Bot API**: Manages commands, sends notifications, and retrieves profile pictures to enhance user interaction.

## Endpoints

### GET /matches

Fetches matches for a specified round. If no round is specified, it defaults to the current round.

**Request Parameters**

- `round` (optional): The round number to fetch matches for.

**Example**

```bash
GET /matches?round=3
```

## Cron Job

The backend uses a cron job, scheduled at **12 AM UTC** daily. Each execution performs:

1. **Fetch Upcoming Matches**: Retrieves upcoming matches and stores them in the database. After storing, it registers each match on-chain, allowing users to make predictions. The Telegram bot also notifies users of these newly added matches.
2. **Update Finished Matches**: Checks for finished matches, updates scores in the database, and triggers a smart contract function to update these results on-chain for any matches that haven’t been scored. Users receive notifications through the Telegram bot whenever scores are updated.

## Smart Contract Integration

Using **starknetjs**, the backend interacts with a starknet smart contract to register matches and update scores on-chain. This allows users to submit their predictions and view results directly via the blockchain.
