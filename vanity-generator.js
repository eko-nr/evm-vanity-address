const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { randomBytes } = require("crypto");
const fs = require("fs");
const os = require("os");

// Use native secp256k1 + js-sha3 for maximum performance
const secp256k1 = require("secp256k1");
const { keccak256 } = require("js-sha3");

function getFlagValue(flagName, defaultValue) {
  const arg = process.argv.find(a => a.startsWith(`--${flagName}=`));
  if (arg) {
    const val = arg.split("=")[1];
    // Return as string for prefix/suffix, as number for numeric flags
    return (typeof defaultValue === 'number' && !isNaN(val)) ? parseInt(val, 10) : val;
  }
  return defaultValue;
}

function getStringFlag(flagName, defaultValue = "") {
  const arg = process.argv.find(a => a.startsWith(`--${flagName}=`));
  return arg ? arg.split("=")[1] : defaultValue;
}

function showHelp() {
  console.log(`
🚀 Ultra-Fast Vanity Address Generator

Usage: node vanity-generator.js [options]

Options:
  --prefix=VALUE        Address prefix (without 0x). Default: "00"
  --suffix=VALUE        Address suffix. Default: "" (none)
  --count=NUMBER        Number of addresses to generate. Default: 1
  --maxWorker=NUMBER    Number of worker threads. Default: CPU count
  --help               Show this help message

Examples:
  node vanity-generator.js --prefix=dead --suffix=beef
  node vanity-generator.js --prefix=1337 --count=5
  node vanity-generator.js --prefix=cafe --suffix=babe --maxWorker=8

Note: Longer prefixes/suffixes take exponentially more time!
`);
}

function calculateProbability(prefix, suffix) {
  const prefixProbability = Math.pow(16, prefix.length);
  const suffixProbability = suffix ? Math.pow(16, suffix.length) : 1;
  return prefixProbability * suffixProbability;
}

function validateHexString(str, name) {
  if (!/^[0-9a-fA-F]*$/.test(str)) {
    throw new Error(`${name} must contain only hexadecimal characters (0-9, a-f, A-F)`);
  }
}

// Ultra-optimized single method using native secp256k1
function generateVanityAddress(privateKeyBuffer) {
  // Get uncompressed public key (65 bytes with 0x04 prefix)
  const publicKey = secp256k1.publicKeyCreate(privateKeyBuffer, false);
  
  // Remove 0x04 prefix and hash with Keccak-256
  const publicKeyBytes = publicKey.slice(1);
  const hash = keccak256.arrayBuffer(publicKeyBytes);
  
  // Last 20 bytes = address
  const addressBytes = new Uint8Array(hash).slice(-20);
  
  return {
    address: '0x' + Buffer.from(addressBytes).toString('hex'),
    privateKey: '0x' + privateKeyBuffer.toString('hex')
  };
}

// Pre-compile regex for faster matching
function createMatcher(prefix, suffix) {
  const prefixRegex = new RegExp(`^0x${prefix}`, 'i');
  const suffixRegex = suffix ? new RegExp(`${suffix}$`, 'i') : null;
  
  return (address) => {
    return prefixRegex.test(address) && (!suffixRegex || suffixRegex.test(address));
  };
}

if (isMainThread) {
  // Check for help flag
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  // Parse command line flags
  const prefix = (getStringFlag("prefix", "00")).toLowerCase();
  const suffix = (getStringFlag("suffix", "")).toLowerCase();
  const numWorkers = getFlagValue("maxWorker", os.cpus().length);
  const walletCount = getFlagValue("count", 1);

  // Validate inputs
  try {
    validateHexString(prefix, "Prefix");
    if (suffix) validateHexString(suffix, "Suffix");
    
    if (prefix.length === 0) {
      throw new Error("Prefix cannot be empty");
    }
    
    if (prefix.length > 10) {
      console.warn(`⚠️  Warning: Prefix length ${prefix.length} may take extremely long to find!`);
    }
    
    if (suffix.length > 8) {
      console.warn(`⚠️  Warning: Suffix length ${suffix.length} may take extremely long to find!`);
    }

    if (walletCount <= 0) {
      throw new Error("Count must be greater than 0");
    }

    if (numWorkers <= 0 || numWorkers > 128) {
      throw new Error("MaxWorker must be between 1 and 128");
    }

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    console.log("Use --help for usage information");
    process.exit(1);
  }

  const expectedTries = calculateProbability(prefix, suffix);

  console.log(`🚀 Ultra-Fast Vanity Generator (Native secp256k1)`);
  console.log(`   Library: secp256k1 (native) + js-sha3`);
  console.log(`   Prefix: "${prefix}"`);
  console.log(`   Suffix: "${suffix || 'none'}"`);
  console.log(`   Count: ${walletCount}`);
  console.log(`   Expected tries per address: ~${expectedTries.toLocaleString()}`);
  console.log(`🖥  Using ${numWorkers} workers`);
  
  let foundCount = 0;
  const workers = [];
  const stats = {};
  const start = Date.now();

  // Create output filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const outputFile = `vanity-results-${timestamp}.txt`;

  for (let i = 0; i < numWorkers; i++) {
    const worker = new Worker(__filename, {
      workerData: { prefix, suffix, id: i }
    });
    workers.push(worker);

    worker.on("message", (msg) => {
      if (msg.type === "found") {
        foundCount++;
        const totalElapsed = (Date.now() - start) / 1000;
        
        console.log(`\n🎯 FOUND! Wallet #${foundCount}`);
        console.log(`Worker: ${msg.workerId}, Tries: ${msg.tries.toLocaleString()}`);
        console.log(`Worker Time: ${msg.elapsed.toFixed(2)}s, Rate: ${msg.rate.toFixed(0)}/s`);
        console.log(`Total Time: ${totalElapsed.toFixed(2)}s`);
        console.log(`Address: ${msg.address}`);
        console.log(`Private: ${msg.privateKey}`);

        const output = `
🎯 Vanity Address #${foundCount}
Generated: ${new Date().toISOString()}
Prefix: ${prefix}, Suffix: ${suffix}
Worker Tries: ${msg.tries.toLocaleString()}
Worker Time: ${msg.elapsed.toFixed(2)}s
Worker Rate: ${msg.rate.toFixed(0)}/s
Total Time: ${totalElapsed.toFixed(2)}s
Address: ${msg.address}
Private Key: ${msg.privateKey}
------------------------
`;
        fs.appendFileSync(outputFile, output);
        console.log(`💾 Saved to ${outputFile}`);

        if (foundCount >= walletCount) {
          console.log(`\n🏆 Complete! Found ${foundCount} vanity addresses in ${totalElapsed.toFixed(2)}s.`);
          
          // Gracefully terminate workers
          workers.forEach(w => {
            w.postMessage({ type: "stop" });
          });
          
          // Give workers time to clean up, then exit
          setTimeout(() => {
            workers.forEach(w => w.terminate());
            process.exit(0);
          }, 100);
        }
      } else if (msg.type === "progress") {
        stats[msg.workerId] = msg;

        let totalTries = 0;
        let totalRate = 0;
        for (const w of Object.values(stats)) {
          totalTries += w.tries;
          totalRate += w.rate;
        }

        const elapsed = (Date.now() - start) / 1000;
        const etaSeconds = totalRate > 0 ? (expectedTries - totalTries) / totalRate : 0;
        
        const eta = etaSeconds < 60 ? `${etaSeconds.toFixed(0)}s` :
                   etaSeconds < 3600 ? `${(etaSeconds/60).toFixed(1)}m` :
                   `${(etaSeconds/3600).toFixed(1)}h`;

        process.stdout.write(
          `⚡ Tries: ${totalTries.toLocaleString()} | Rate: ${totalRate.toFixed(0)}/s | ETA: ${eta}     \r`
        );
      } else if (msg.type === "error") {
        console.error(`\n❌ Worker ${msg.workerId} error: ${msg.error}`);
      }
    });

    worker.on("error", (error) => {
      console.error(`❌ Worker ${i} error:`, error);
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        console.error(`❌ Worker ${i} stopped with exit code ${code}`);
      }
    });
  }

  // Optimistic estimate with native libraries
  const estimatedRate = 25000 * numWorkers; // Native is fastest
  const estimatedTime = expectedTries / estimatedRate;
  console.log(`⏱️  Estimated time: ~${estimatedTime < 3600 ? (estimatedTime/60).toFixed(1) + 'm' : (estimatedTime/3600).toFixed(1) + 'h'}`);
  console.log(`🔥 Starting generation...\n`);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down gracefully...');
    workers.forEach(w => {
      w.postMessage({ type: "stop" });
      w.terminate();
    });
    process.exit(0);
  });

} else {
  // WORKER THREAD - Maximum optimization
  const { prefix, suffix, id } = workerData;
  let tries = 0;
  let shouldStop = false;
  const start = Date.now();
  
  // Pre-compile matcher for this worker
  const isMatch = createMatcher(prefix, suffix);
  
  // Large batch size for fewer interruptions
  const BATCH_SIZE = 2000;
  
  // Pre-allocate buffer for reuse
  const privateKeyBuffer = Buffer.alloc(32);
  
  // Listen for stop messages
  parentPort.on('message', (msg) => {
    if (msg.type === 'stop') {
      shouldStop = true;
    }
  });
  
  try {
    while (!shouldStop) {
      // Process in large batches
      for (let batch = 0; batch < BATCH_SIZE && !shouldStop; batch++) {
        // Generate random private key directly into buffer
        randomBytes(32).copy(privateKeyBuffer);
        
        // Skip invalid private keys (very rare but necessary for native lib)
        if (!secp256k1.privateKeyVerify(privateKeyBuffer)) {
          continue;
        }
        
        const wallet = generateVanityAddress(privateKeyBuffer);
        tries++;

        if (isMatch(wallet.address)) {
          const elapsed = (Date.now() - start) / 1000;
          const rate = tries / elapsed;

          parentPort.postMessage({
            type: "found",
            workerId: id,
            tries,
            elapsed,
            rate,
            address: wallet.address,
            privateKey: wallet.privateKey,
          });
          return;
        }
      }

      // Report progress less frequently
      if (tries % 10000 === 0) {
        const elapsed = (Date.now() - start) / 1000;
        const rate = tries / elapsed;
        parentPort.postMessage({
          type: "progress",
          workerId: id,
          tries,
          elapsed,
          rate,
        });
      }
    }
  } catch (error) {
    parentPort.postMessage({
      type: "error",
      workerId: id,
      error: error.message
    });
  }
}