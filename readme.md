# Ethereum Vanity Address Generator

A high-performance, multi-threaded Ethereum vanity address generator built with Node.js worker threads. Generate custom Ethereum addresses with specific prefixes and suffixes efficiently using all available CPU cores.

## Features

- 🚀 **Multi-threaded**: Utilizes all CPU cores for maximum performance
- 🎯 **Prefix & Suffix Support**: Generate addresses with custom prefixes and/or suffixes
- 📊 **Real-time Progress**: Live statistics showing tries, rate, and ETA
- 💾 **Auto-save Results**: Automatically saves found addresses to `result.txt`
- ⚙️ **Configurable**: Adjust worker count and target wallet count
- 📈 **Performance Monitoring**: Tracks generation rate and elapsed time

## Installation

1. **Clone or download the repository**

2. **Install dependencies:**
```bash
npm install
```

3. **Make sure you have Node.js 12+ installed** (required for worker threads support)

## Usage

### Basic Usage

```bash
node vanity-generator.js [prefix] [suffix]
```

### Examples

**Generate address with prefix "dead":**
```bash
node vanity-generator.js dead
```

**Generate address with prefix "cafe" and suffix "beef":**
```bash
node vanity-generator.js cafe beef
```

**Generate multiple wallets with custom worker count:**
```bash
node vanity-generator.js abc123 --count=5 --maxWorker=8
```

## Command Line Arguments

### Positional Arguments
- `prefix` (optional): Desired prefix for the address (after "0x"). Default: "1234"
- `suffix` (optional): Desired suffix for the address. Default: none

### Flags
- `--count=N`: Number of vanity wallets to generate. Default: 1
- `--maxWorker=N`: Maximum number of worker threads to use. Default: number of CPU cores

## Examples

```bash
# Generate 1 address starting with "0xdead"
node vanity-generator.js dead

# Generate 3 addresses starting with "0xcafe" and ending with "beef"
node vanity-generator.js cafe beef --count=3

# Use only 4 workers instead of all CPU cores
node vanity-generator.js abc --maxWorker=4

# Generate 10 addresses with prefix "test"
node vanity-generator.js test --count=10
```

## Output

### Console Output
The program displays:
- Search parameters (prefix, suffix, expected tries)
- Worker configuration
- Real-time progress (total tries, elapsed time, generation rate, ETA)
- Found wallet details (address, private key, statistics)

### File Output
Found wallets are automatically saved to `result.txt` with the following format:
```
✅ Vanity Address Found!
Wallet #: 1
Prefix: dead
Suffix: 
Tries: 125847
Time elapsed: 15.32 seconds
Rate: 8216 addr/sec
Address: 0xdead1234567890abcdef1234567890abcdef1234
PrivateKey: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12
-----------------------------
```

## Performance

- **Single Core**: ~200,000 addresses/second
- **Multi-Core**: Scales linearly with CPU cores
- **Memory Usage**: Very low, generates addresses on-demand

### Difficulty Estimates

| Characters | Expected Tries | Time (8 cores @ 1.6M/s) |
|------------|----------------|--------------------------|
| 3 chars    | ~4,000         | < 1 second              |
| 4 chars    | ~65,000        | < 1 minute              |
| 5 chars    | ~1 million     | ~10 minutes             |
| 6 chars    | ~16 million    | ~3 hours                |
| 7 chars    | ~268 million   | ~2 days                 |

## Technical Details

### Dependencies
- `ethers`: Ethereum wallet generation and cryptographic functions
- `worker_threads`: Node.js built-in module for multi-threading
- `fs`: File system operations
- `os`: Operating system utilities

### Architecture
- **Main Thread**: Coordinates workers, displays progress, handles results
- **Worker Threads**: Generate addresses independently using different random seeds
- **Communication**: Workers report progress every 500 tries and immediately upon finding matches

## Security Notes

⚠️ **Important Security Considerations:**

1. **Private Keys**: The generated private keys are displayed in console and saved to file. Ensure proper security:
   - Never share your private keys
   - Secure the `result.txt` file
   - Consider encrypting stored private keys

2. **Random Number Generation**: Uses `ethers.Wallet.createRandom()` which should be cryptographically secure

3. **Production Use**: Always verify the randomness and security of generated wallets before using them with real funds

## Requirements

- Node.js 12.0.0 or higher (for worker threads support)
- NPM or Yarn package manager

**Disclaimer**: This tool is for educational and development purposes. Always verify the security and randomness of generated wallets before using them with real cryptocurrency.