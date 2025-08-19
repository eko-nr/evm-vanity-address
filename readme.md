# Ethereum Vanity Address Generator

A high-performance, multi-threaded Ethereum vanity address generator built with Node.js worker threads and native cryptographic libraries. Generate custom Ethereum addresses with specific prefixes and suffixes efficiently using all available CPU cores.

## Features

- 🚀 **Ultra-Fast Performance**: Uses native secp256k1 library for maximum speed (~25,000 addr/sec per core)
- 🎯 **Prefix & Suffix Support**: Generate addresses with custom prefixes and/or suffixes
- 📊 **Real-time Progress**: Live statistics showing tries, rate, and ETA
- 💾 **Auto-save Results**: Automatically saves found addresses with timestamps
- ⚙️ **Configurable**: Command-line flags for all options
- 📈 **Performance Monitoring**: Tracks generation rate and elapsed time per worker
- 🛡️ **Input Validation**: Validates hex strings and warns about long searches
- 🆘 **Help System**: Built-in help and usage examples

## Installation

1. **Clone or download the repository**

2. **Install dependencies:**
```bash
npm install
```

3. **Make sure you have Node.js 12+ installed** (required for worker threads support)

## Usage

### Command-Line Interface

```bash
node vanity-generator.js [options]
```

### Available Options

| Flag | Description | Default |
|------|-------------|---------|
| `--prefix=VALUE` | Address prefix (without 0x) | `"00"` |
| `--suffix=VALUE` | Address suffix | `""` (none) |
| `--count=NUMBER` | Number of addresses to generate | `1` |
| `--maxWorker=NUMBER` | Number of worker threads | CPU cores |
| `--help` | Show help message | - |

### Examples

**Show help:**
```bash
node vanity-generator.js --help
```

**Generate address with prefix "dead":**
```bash
node vanity-generator.js --prefix=dead
```

**Generate address with prefix "cafe" and suffix "beef":**
```bash
node vanity-generator.js --prefix=cafe --suffix=beef
```

**Generate 5 wallets with custom worker count:**
```bash
node vanity-generator.js --prefix=1337 --count=5 --maxWorker=8
```

**Generate address with only suffix:**
```bash
node vanity-generator.js --suffix=dead
```

## Output

### Console Output
The program displays:
- Search parameters (prefix, suffix, expected tries)
- Worker configuration and performance estimates
- Real-time progress (total tries, generation rate, ETA)
- Found wallet details (address, private key, statistics)

Example output:
```
🚀 Ultra-Fast Vanity Generator (Native secp256k1)
   Library: secp256k1 (native) + js-sha3
   Prefix: "dead"
   Suffix: "beef"
   Count: 1
   Expected tries per address: ~4,294,967,296
🖥  Using 8 workers
⏱️  Estimated time: ~2.4h
🔥 Starting generation...

⚡ Tries: 1,234,567 | Rate: 189,432/s | ETA: 6.3h

🎯 FOUND! Wallet #1
Worker: 3, Tries: 2,847,392
Worker Time: 15.32s, Rate: 185,940/s
Total Time: 15.32s
Address: 0xdead1234567890abcdef1234567890abcdefbeef
Private: 0x1234...cdef
💾 Saved to vanity-results-2025-08-19T10-30-45.txt
```

### File Output
Found wallets are automatically saved to timestamped files (e.g., `vanity-results-2025-08-19T10-30-45.txt`) with detailed information:

```
🎯 Vanity Address #1
Generated: 2025-08-19T10:30:45.123Z
Prefix: dead, Suffix: beef
Worker Tries: 2,847,392
Worker Time: 15.32s
Worker Rate: 185,940/s
Total Time: 15.32s
Address: 0xdead1234567890abcdef1234567890abcdefbeef
Private Key: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12
------------------------
```

## Performance

- **Single Core**: ~25,000 addresses/second (with native secp256k1)
- **Multi-Core**: Scales linearly with CPU cores
- **Memory Usage**: Very low, generates addresses on-demand
- **Native Libraries**: Maximum performance with secp256k1 + js-sha3

### Difficulty Estimates

| Characters | Expected Tries | Time (8 cores @ 200K/s) |
|------------|----------------|---------------------------|
| 1 char     | ~16            | Instant                  |
| 2 chars    | ~256           | Instant                  |
| 3 chars    | ~4,096         | < 1 second               |
| 4 chars    | ~65,536        | < 1 second               |
| 5 chars    | ~1 million     | ~5 seconds               |
| 6 chars    | ~16 million    | ~1.3 minutes             |
| 7 chars    | ~268 million   | ~22 minutes              |
| 8 chars    | ~4.3 billion   | ~6 hours                 |

**Note:** Suffix adds the same complexity as prefix. A 4-char prefix + 4-char suffix = 8 total characters of difficulty.

## Technical Details

### Dependencies
- `secp256k1`: Native elliptic curve cryptography (maximum performance)
- `js-sha3`: Keccak-256 hashing for Ethereum addresses
- `worker_threads`: Node.js built-in module for multi-threading
- `crypto`: Cryptographically secure random number generation
- `fs`: File system operations
- `os`: Operating system utilities

### Architecture
- **Main Thread**: Coordinates workers, displays progress, handles results
- **Worker Threads**: Generate addresses independently using cryptographically secure randomness
- **Communication**: Workers report progress every 10,000 tries and immediately upon finding matches
- **Optimization**: Pre-compiled regex patterns, buffer reuse, batch processing

### Performance Optimizations
- **Native Libraries**: Uses native secp256k1 instead of pure JavaScript
- **Buffer Reuse**: Pre-allocated buffers to minimize garbage collection
- **Batch Processing**: Processes 2,000 addresses before checking for interrupts
- **Optimized Regex**: Pre-compiled pattern matching
- **Efficient Hashing**: Direct Keccak-256 implementation

## Input Validation

The generator includes comprehensive input validation:
- ✅ Validates hexadecimal characters only (0-9, a-f, A-F)
- ⚠️ Warns about searches that may take extremely long (>8-10 characters)
- ❌ Prevents invalid worker counts and other parameter errors
- 🆘 Provides helpful error messages and suggestions

## Security Notes

⚠️ **Important Security Considerations:**

1. **Private Keys**: Generated private keys are displayed in console and saved to files:
   - Never share your private keys
   - Secure the result files (consider encrypting them)
   - Clear console history after use
   - Delete result files after importing keys to wallet

2. **Cryptographic Security**: 
   - Uses Node.js `crypto.randomBytes()` for cryptographically secure randomness
   - Native secp256k1 library ensures proper key generation
   - Validates private keys before use

3. **Production Use**: 
   - Always test with small amounts first
   - Verify address generation independently
   - Consider using hardware wallets for large amounts

4. **File Security**:
   - Result files contain sensitive private keys
   - Set proper file permissions (`chmod 600`)
   - Consider encrypted storage

## Requirements

- **Node.js**: Version 12.0.0 or higher (for worker threads support)
- **NPM/Yarn**: Package manager
- **Native Compilation**: Requires build tools for secp256k1
  - **Windows**: Visual Studio Build Tools or Visual Studio Community
  - **macOS**: Xcode Command Line Tools
  - **Linux**: build-essential package

### Installation on Different Platforms

**Windows:**
```bash
npm install --global windows-build-tools
npm install secp256k1 js-sha3
```

**macOS:**
```bash
xcode-select --install
npm install secp256k1 js-sha3
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install build-essential
npm install secp256k1 js-sha3
```

## Troubleshooting

**Native module compilation errors:**
- Ensure you have the proper build tools installed
- Try rebuilding: `npm rebuild secp256k1`
- On Windows, install Visual Studio Build Tools

**Performance issues:**
- Check CPU usage with task manager
- Reduce worker count if system becomes unresponsive
- Ensure adequate cooling for sustained high CPU usage

**Out of memory errors:**
- Reduce batch size in worker threads
- Lower worker count on systems with limited RAM

## License

This project is for educational and development purposes. Please ensure compliance with local laws and regulations when using this software.

**Disclaimer**: This tool is for educational and development purposes. The authors are not responsible for any loss of funds or security issues. Always verify the security and randomness of generated wallets before using them with real cryptocurrency. Use at your own risk.