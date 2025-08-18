const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { secp256k1 } = require("@noble/secp256k1");
const { keccak_256 } = require("@noble/hashes/sha3");
const { randomBytes } = require("crypto");
const fs = require("fs");
const os = require("os");

function getFlagValue(flagName, defaultValue) {
  const arg = process.argv.find(a => a.startsWith(`--${flagName}=`));
  if (arg) {
    const val = arg.split("=")[1];
    return isNaN(val) ? defaultValue : parseInt(val, 10);
  }
  return defaultValue;
}

// Calculate accurate probability for prefix + suffix combination
function calculateProbability(prefix, suffix) {
  // Each hex character has 1/16 probability
  const prefixProbability = Math.pow(16, prefix.length);
  const suffixProbability = suffix ? Math.pow(16, suffix.length) : 1;
  
  // For combined prefix+suffix, multiply the probabilities
  return prefixProbability * suffixProbability;
}

// Generate Ethereum address from private key using noble-secp256k1
function generateAddressFromPrivateKey(privateKey) {
  // Get public key from private key
  const publicKey = secp256k1.getPublicKey(privateKey, false); // uncompressed
  
  // Remove the 0x04 prefix for uncompressed key, keep only x,y coordinates
  const publicKeyBytes = publicKey.slice(1);
  
  // Hash with Keccak-256
  const hash = keccak_256(publicKeyBytes);
  
  // Take last 20 bytes as address
  const address = hash.slice(-20);
  
  return {
    address: '0x' + Buffer.from(address).toString('hex'),
    privateKey: '0x' + Buffer.from(privateKey).toString('hex')
  };
}

if (isMainThread) {
  // ---- MAIN THREAD ----
  const prefix = (process.argv[2] || "1234").toLowerCase();
  const suffix = (process.argv[3] || "").toLowerCase();

  const expectedTries = calculateProbability(prefix, suffix);
  const numWorkers = Math.min(getFlagValue("maxWorker", os.cpus().length), os.cpus().length);
  const walletCount = getFlagValue("count", 1);

  console.log(`🔎 Searching vanity address with @noble/secp256k1...`);
  console.log(`   Prefix: ${prefix}`);
  console.log(`   Suffix: ${suffix}`);
  console.log(`   Expected tries (per wallet): ~${expectedTries.toLocaleString()}`);
  console.log(`🖥 Using ${numWorkers} workers...`);
  console.log(`🎯 Target wallet count: ${walletCount}`);

  let foundCount = 0;
  const workers = [];
  const stats = {};
  const start = Date.now();
  
  // Track performance for better ETA calculation
  let lastStatsUpdate = start;
  let lastTotalTries = 0;

  for (let i = 0; i < numWorkers; i++) {
    const worker = new Worker(__filename, {
      workerData: { prefix, suffix, id: i }
    });
    workers.push(worker);

    worker.on("message", (msg) => {
      if (msg.type === "found") {
        foundCount++;
        console.log(`\n✅ MATCH FOUND! (Wallet #${foundCount})`);
        console.log("Worker:", msg.workerId);
        console.log("Tries:", msg.tries.toLocaleString());
        console.log("Time elapsed:", msg.elapsed.toFixed(2), "seconds");
        console.log("Rate:", msg.rate.toFixed(0), "addr/sec");
        console.log("Address:", msg.address);
        console.log("PrivateKey:", msg.privateKey);

        const output = `
✅ Vanity Address Found!
Wallet #: ${foundCount}
Prefix: ${prefix}
Suffix: ${suffix}
Tries: ${msg.tries.toLocaleString()}
Time elapsed: ${msg.elapsed.toFixed(2)} seconds
Rate: ${msg.rate.toFixed(0)} addr/sec
Address: ${msg.address}
PrivateKey: ${msg.privateKey}
-----------------------------
`;
        fs.appendFileSync("result.txt", output, "utf8");
        console.log("📂 Saved to result.txt");

        if (foundCount >= walletCount) {
          console.log(`\n🎉 Finished! Generated ${foundCount} vanity wallets.`);
          process.exit(0);
        }
      } else if (msg.type === "progress") {
        stats[msg.workerId] = msg;

        // Calculate global progress with better accuracy
        let totalTries = 0;
        let totalRate = 0;
        for (const w of Object.values(stats)) {
          totalTries += w.tries;
          totalRate += w.rate;
        }

        const elapsed = (Date.now() - start) / 1000;
        
        // Calculate more accurate ETA based on actual performance
        let etaSeconds = 0;
        if (totalRate > 0) {
          const remainingWallets = walletCount - foundCount;
          const averageTriesNeeded = expectedTries * remainingWallets;
          etaSeconds = averageTriesNeeded / totalRate;
        }
        
        const etaFormatted = formatTime(etaSeconds);

        // Calculate probability percentage
        const probability = (1 / expectedTries) * 100;
        const probabilityStr = probability > 0.01 ? 
          `${probability.toFixed(4)}%` : 
          `${probability.toExponential(2)}`;

        process.stdout.write(
          `Tries: ${totalTries.toLocaleString()}, elapsed: ${elapsed.toFixed(1)}s, rate: ${totalRate.toFixed(0)}/s, prob: ${probabilityStr}, ETA: ${etaFormatted}     \r`
        );
      }
    });
  }

  // Updated initial rate estimate for noble-secp256k1 (typically 3-5x faster than ethers)
  const initialRate = 6000 * numWorkers; // More realistic estimate for noble-secp256k1
  const initialEta = expectedTries / initialRate;
  console.log(`⏳ Initial ETA estimate: ~${formatTime(initialEta)}\n`);

} else {
  // ---- WORKER THREAD ----
  const { prefix, suffix, id } = workerData;
  let tries = 0;
  const start = Date.now();

  while (true) {
    // Generate random 32-byte private key
    const privateKey = randomBytes(32);
    
    // Generate address using noble-secp256k1
    const wallet = generateAddressFromPrivateKey(privateKey);
    const addr = wallet.address.toLowerCase();
    tries++;

    // Check both prefix and suffix conditions
    const hasPrefix = addr.startsWith("0x" + prefix);
    const hasSuffix = !suffix || addr.endsWith(suffix);
    
    if (hasPrefix && hasSuffix) {
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
    }

    // Report progress more frequently early on, less frequently later
    const progressInterval = tries < 10000 ? 2000 : 
                           tries < 100000 ? 10000 : 25000;
    
    if (tries % progressInterval === 0) {
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
}

// Helper function to format time duration
function formatTime(seconds) {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  } else if (seconds < 3600) {
    return `${(seconds / 60).toFixed(1)}m`;
  } else if (seconds < 86400) {
    return `${(seconds / 3600).toFixed(1)}h`;
  } else if (seconds < 2592000) { // 30 days
    return `${(seconds / 86400).toFixed(1)}d`;
  } else if (seconds < 31536000) { // 1 year
    return `${(seconds / 2592000).toFixed(1)} months`;
  } else {
    return `${(seconds / 31536000).toFixed(1)} years`;
  }
}