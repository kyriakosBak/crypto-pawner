import { Interface } from '@ethersproject/abi';
import { TransactionRequest } from '@ethersproject/providers';
import { FlashbotsBundleProvider, FlashbotsBundleRawTransaction, FlashbotsBundleResolution, FlashbotsBundleTransaction } from '@flashbots/ethers-provider-bundle';
import axios from 'axios';
import dotenv from 'dotenv';
import { BigNumber, providers, Wallet } from 'ethers';
import path from 'path';
import { exit } from 'process';
import { ConsoleLogger, FileLogger, Logger, MultiLogger } from './logger';
import { padLeft } from './utils';

const GWEI = BigNumber.from(10).pow(9)
const ETH = BigNumber.from(10).pow(18)

dotenv.config()
const IS_PROD = process.env.IS_PROD ? process.env.IS_PROD === "true" : false
const NFT_PRICE_ETH = process.env.NFT_PRICE_ETH ? ETH.mul(Number(process.env.NFT_PRICE_ETH) * 10000).div(10000) : BigNumber.from(0)
const NFT_PIECES = Number(process.env.NFT_PIECES)
const NFT_PIECES_PER_MINT = Number(process.env.NFT_PIECES_PER_MINT)
const MINER_BRIBE_GWEI = process.env.MINER_BRIBER_GWEI
    ? GWEI.mul(BigNumber.from(process.env.MINER_BRIBE_GWEI))
    : GWEI.mul(2).add(1)  // 2.000000001 GWEI

const NFT_ADDRESS = process.env.NFT_ADDRESS
const MINT_DATA = process.env.MINT_DATA
const FLASHBOTS_ENDPOINT = process.env.FLASHBOTS_ENDPOINT ? process.env.FLASHBOTS_ENDPOINT : "https://relay-goerli.flashbots.net"
const ETHERSCAN_ENDPOINT = process.env.ETHERSCAN_ENDPOINT ? process.env.ETHERSCAN_ENDPOINT : "https://api-goerli.etherscan.io"
const ETHERSCAN_TOKEN = process.env.ETHERSCAN_TOKEN
const CHAIN_ID = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 5
const BLOCKS_IN_FUTURE = process.env.BLOCKS_IN_FUTURE ? Number(process.env.BLOCKS_IN_FUTURE) : 1
const provider = new providers.InfuraProvider(CHAIN_ID, process.env.INFURA_TOKEN)

// wallet keys
const FLASBHOTS_PRIVATE_KEY = process.env.FLASBHOTS_PRIVATE_KEY
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY

let authSigner: Wallet
let wallet: Wallet
let logger: Logger

function runChecksAndInit() {
    var logFileName = process.platform == "win32" ? `log_${new Date().toISOString()}.txt`.replaceAll(':', '.') : `log_${new Date().toISOString()}.txt`
    var logFilepath = path.join(__dirname, "../", "logs", logFileName)

    logger = new MultiLogger([new ConsoleLogger(), new FileLogger(logFilepath)])

    if (FLASBHOTS_PRIVATE_KEY == undefined) {
        logger.error("Flasbhots key undefined. Exiting")
        process.exit(1)
    }

    if (ETHERSCAN_TOKEN == undefined) {
        logger.error("Etherscan token undefined. Exiting")
        process.exit(1)
    }

    if (WALLET_PRIVATE_KEY == undefined) {
        logger.error("Private key wallet undefined. Exiting.")
        process.exit(1)
    }

    if (process.env.NFT_ADDRESS == undefined) {
        logger.error("NFT Contract undefined. Exiting.")
        process.exit(1)
    }

    authSigner = new Wallet(FLASBHOTS_PRIVATE_KEY)
    wallet = new Wallet(WALLET_PRIVATE_KEY, provider)
}

function getTransaction(txdata: string, maxBaseFee: BigNumber): TransactionRequest {
    return {
        chainId: CHAIN_ID,
        type: 2,
        value: NFT_PRICE_ETH,
        data: txdata,
        maxFeePerGas: maxBaseFee.add(MINER_BRIBE_GWEI),
        maxPriorityFeePerGas: MINER_BRIBE_GWEI, // max priority fee == bribe
        to: NFT_ADDRESS,
    }
}

async function getNFTMintData(nftAdress: string | undefined): Promise<string> {
    const url = ETHERSCAN_ENDPOINT + '/api?module=contract&action=getabi&address=' + nftAdress + '&apikey=' + ETHERSCAN_TOKEN
    try {
        const response = await axios.get(url);
        const jsonAbi = JSON.parse(response.data.result);

        for (const element of jsonAbi) {
            if (element.hasOwnProperty("name") && element["name"].toLowerCase().includes("mint") && element.hasOwnProperty("stateMutability") && element["stateMutability"] === "payable") {
                const iface = new Interface(jsonAbi)
                const functionData = iface.getSighash(element["name"])
                // if there is only one input in the mint funciton, we assume it's the number of tokens we want to buy
                if (element.hasOwnProperty("inputs") && element["inputs"].length !== 0) {
                    if (!element["inputs"].hasOwnProperty(1) && element["inputs"][0]["type"].includes('int')) {
                        // We get number of bit and divide by four to get the hex string that needs to be sent
                        const hexDigits: number = element["inputs"][0]["type"].replace('uint', '').replace('int', '') / 4
                        let hexData: string = padLeft(NFT_PIECES.toString(), hexDigits)
                        return functionData + hexData
                    }
                    else
                        throw new Error("Cannot figure out txData. User needs to provide it in manually. Aborting");
                }
                else {
                    return functionData
                }
            }
        }
    } catch (exception) {
        logger.error(JSON.stringify(exception))
    }
    logger.info("Could not find mint function.")
    return ""
}

async function main() {
    // Start Flashbots provider and get mint function data
    const flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner, FLASHBOTS_ENDPOINT)
    const transactionMintData = MINT_DATA ? MINT_DATA : await getNFTMintData(NFT_ADDRESS)
    if (transactionMintData === '') { return }

    const blockNumber = await provider.getBlockNumber()
    const block = await provider.getBlock(blockNumber)
    const maxBaseFeeInFutureBlock = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(BigNumber.from(block.baseFeePerGas), BLOCKS_IN_FUTURE)

    // Define multiple contracts or just a big one
    let bundledTransaction: (FlashbotsBundleTransaction | FlashbotsBundleRawTransaction)[] = []
    const contractsToMint = Number(NFT_PIECES) / Number(NFT_PIECES_PER_MINT)
    for (let index = 0; index < contractsToMint; index++) {
        bundledTransaction.push(
            {
                transaction: getTransaction(transactionMintData, maxBaseFeeInFutureBlock),
                signer: wallet
            }
        )
    }
    const signedBundle = await flashbotsProvider.signBundle(bundledTransaction)
    const simulation = await flashbotsProvider.simulate(signedBundle, blockNumber + BLOCKS_IN_FUTURE)
    if ('error' in simulation) {
        logger.error(`Simulation Error: ${simulation.error.message}`)
        process.exit(1)
    } else {
        logger.debug(`Simulation Success: ${JSON.stringify(simulation, null, 2)}`)
    }

    const balanceBefore = await wallet.getBalance()
    for (let block = 1; block < blockNumber + BLOCKS_IN_FUTURE; block++) {
        let targetBlock = block + blockNumber
        logger.info("Sending transaction for block " + targetBlock)
        const bundleSubmission = await flashbotsProvider.sendBundle(bundledTransaction, targetBlock)
        if ('error' in bundleSubmission) {
            logger.error(bundleSubmission.error.message)
            throw new Error(bundleSubmission.error.message);
        }

        const waitResponse = await bundleSubmission.wait()
        logger.debug(`Wait Response: ${FlashbotsBundleResolution[waitResponse]}`)

        if (waitResponse === FlashbotsBundleResolution.BundleIncluded) {
            logger.info("Bundle included in block " + targetBlock)
            process.exit(0)
        }
        else if (waitResponse === FlashbotsBundleResolution.AccountNonceTooHigh) {
            logger.error("Account nonce too high.")
            process.exit(1)
        }
        else {
            if (IS_PROD) {
                // TODO - Need to somehow log this in logger
                logger.info(JSON.stringify(await flashbotsProvider.getBundleStats(simulation.bundleHash, targetBlock)))
                logger.info(JSON.stringify(await flashbotsProvider.getUserStats()))
            }
        }
    }
    exit(1)
}

runChecksAndInit();
main();
