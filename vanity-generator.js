const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { randomBytes } = require("crypto");
const fs = require("fs");
const os = require("os");

// Try multiple libraries in order of performance
let secp256k1, keccak256;

try {
  // First try: WebAssembly version (fastest for JS)
  const secp = require("@bitcoinerlab/secp256k1");
  const { keccak_256 } = require("@noble/hashes/sha3");
  secp256k1 = {
    getPublicKey: secp.getPublicKey,
    utils: { isValidPrivateKey: secp.utils.isValidPrivateKey }
  };
  keccak256 = (data) => keccak_256(data);
  console.log("✅ Using @bitcoinerlab/secp256k1 (WASM) - Expected: ~20,000/s per worker");
} catch (e1) {
  try {
    // Second try: @scure optimized version
    const secp = require("@scure/secp256k1");
    const { keccak_256 } = require("@noble/hashes/sha3");
    secp256k1 = {
      getPublicKey: secp.getPublicKey,
      utils: { isValidPrivateKey: secp.utils.isValidPrivateKey }
    };
    keccak256 = (data) => keccak_256(data);
    console.log("✅ Using @scure/secp256k1 - Expected: ~15,000/s per worker");
  } catch (e2) {
    try {
      // Third try: Native bindings
      const secp = require("secp256k1");
      const { keccak256: keccak } = require("js-sha3");
      secp256k1 = {
        getPublicKey: (key) => secp.publicKeyCreate(key, false),
        utils: { isValidPrivateKey: secp.privateKeyVerify }
      };
      keccak256 = (data) => Buffer.from(keccak.arrayBuffer(data));
      console.log("✅ Using secp256k1 (native)");
    } catch (e3) {
      // Fallback to ethers
      console.log("⚠️  Falling back to ethers");
      console.log("Install faster libs: npm install @bitcoinerlab/secp256k1 @noble/hashes");
    }
  }
}

function getFlagValue(flagName, defaultValue) {
  const arg = process.argv.find(a => a.startsWith(`--${flagName}=`));
  if (arg) {
    const val = arg.split("=")[1];
    return isNaN(val) ? defaultValue : parseInt(val, 10);
  }
  return defaultValue;
}

function calculateProbability(prefix, suffix) {
  const prefixProbability = Math.pow(16, prefix.length);
  const suffixProbability = suffix ? Math.pow(16, suffix.length) : 1;
  return prefixProbability * suffixProbability;
}

// Ultra-optimized address generation
function generateAddressFromPrivateKey(privateKey) {
  if (!secp256k1) {
    // Fallback to ethers
    const ethers = require("ethers");
    const wallet = new ethers.Wallet(privateKey);
    return {
      address: wallet.address,
      privateKey: wallet.privateKey
    };
  }

  // Get uncompressed public key
  const publicKey = secp256k1.getPublicKey(privateKey, false);
  
  // Remove 0x04 prefix, hash with Keccak-256
  const publicKeyBytes = publicKey.slice(1);
  const hash = keccak256(publicKeyBytes);
  
  // Last 20 bytes = address
  const address = hash.slice(-20);
  
  return {
    address: '0x' + Buffer.from(address).toString('hex'),
    privateKey: '0x' + Buffer.from(privateKey).toString('hex')
  };
}

// Pre-allocate for better performance (removed unused buffer)
// const PRIVATE_KEY_BUFFER = Buffer.alloc(32); // Not needed anymore

if (isMainThread) {
  const prefix = (process.argv[2] || "00").toLowerCase();
  const suffix = (process.argv[3] || "dead").toLowerCase();

  const expectedTries = calculateProbability(prefix, suffix);
  const numWorkers = Math.min(getFlagValue("maxWorker", os.cpus().length * 2), os.cpus().length * 2);
  const walletCount = getFlagValue("count", 1);

  console.log(`🚀 Ultra-Fast Vanity Address Generator`);
  console.log(`   Prefix: ${prefix}`);
  console.log(`   Suffix: ${suffix}`);
  console.log(`   Expected tries: ~${expectedTries.toLocaleString()}`);
  console.log(`🖥  Using ${numWorkers} workers (2x CPU cores for max performance)`);
  
  let foundCount = 0;
  const workers = [];
  const stats = {};
  const start = Date.now();

  for (let i = 0; i < numWorkers; i++) {
    const worker = new Worker(__filename, {
      workerData: { prefix, suffix, id: i }
    });
    workers.push(worker);

    worker.on("message", (msg) => {
      if (msg.type === "found") {
        foundCount++;
        console.log(`\n🎯 FOUND! Wallet #${foundCount}`);
        console.log(`Worker: ${msg.workerId}, Tries: ${msg.tries.toLocaleString()}`);
        console.log(`Time: ${msg.elapsed.toFixed(2)}s, Rate: ${msg.rate.toFixed(0)}/s`);
        console.log(`Address: ${msg.address}`);
        console.log(`Private: ${msg.privateKey}`);

        const output = `
🎯 Vanity Address #${foundCount}
Prefix: ${prefix}, Suffix: ${suffix}
Tries: ${msg.tries.toLocaleString()}
Time: ${msg.elapsed.toFixed(2)}s
Rate: ${msg.rate.toFixed(0)}/s
Address: ${msg.address}
Private: ${msg.privateKey}
------------------------
`;
        fs.appendFileSync("ultra-results.txt", output);
        console.log("💾 Saved to ultra-results.txt");

        if (foundCount >= walletCount) {
          console.log(`\n🏆 Complete! Found ${foundCount} vanity addresses.`);
          process.exit(0);
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
      }
    });
  }

  // Estimate based on library being used
  const estimatedRate = secp256k1 ? 15000 * numWorkers : 2000 * numWorkers;
  const estimatedTime = expectedTries / estimatedRate;
  console.log(`⏱️  Estimated time: ~${estimatedTime < 3600 ? (estimatedTime/60).toFixed(1) + 'm' : (estimatedTime/3600).toFixed(1) + 'h'}`);
  console.log(`🔥 Starting generation...\n`);

} else {
  // WORKER THREAD - Ultra optimized
  const { prefix, suffix, id } = workerData;
  let tries = 0;
  const start = Date.now();

  // Batch processing for better performance
  const BATCH_SIZE = 1000;
  
  while (true) {
    // Process in batches to reduce message overhead
    for (let batch = 0; batch < BATCH_SIZE; batch++) {
      // Generate random private key
      const privateKey = randomBytes(32);
      
      // Skip invalid keys (very rare)
      if (secp256k1 && secp256k1.utils && !secp256k1.utils.isValidPrivateKey(privateKey)) {
        continue;
      }
      
      const wallet = generateAddressFromPrivateKey(privateKey);
      const addr = wallet.address.toLowerCase();
      tries++;

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
        return; // Exit after finding
      }
    }

    // Report progress every batch
    if (tries % 5000 === 0) {
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