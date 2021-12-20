import { defaultAbiCoder, Interface } from '@ethersproject/abi';
import { keccak256 } from '@ethersproject/keccak256';
import { TransactionRequest } from '@ethersproject/providers';
import { FlashbotsBundleProvider, FlashbotsBundleRawTransaction, FlashbotsBundleResolution, FlashbotsBundleTransaction } from '@flashbots/ethers-provider-bundle';
import axios from 'axios';
import dotenv from 'dotenv';
import * as env from 'env-var'
import { BigNumber, Contract, providers, Wallet } from 'ethers';
import { arrayify, hexlify, id, solidityKeccak256 } from 'ethers/lib/utils';
import path from 'path';
import { exit } from 'process';
import { sendFlasbhotTransaction } from './flasbhotSender';
import { ConsoleLogger, FileLogger, Logger, MultiLogger } from './logger';
import * as fs from "fs"
import { ETH, getContractABIJson, padLeft } from './utils';

const GWEI = BigNumber.from(10).pow(9)

dotenv.config()
const NFT_PRICE_ETH = env.get('NFT_PRICE_ETH').required().asFloat()
const NFT_PIECES_TOTAL = env.get('NFT_PIECES_TOTAL').required().asInt()
const NFT_PIECES_PER_MINT = env.get('NFT_PIECES_PER_MINT').required().asInt()
const MINER_BRIBE_GWEI = env.get('MINER_BRIBE_GWEI').default(2.000000001).asFloat()

const NFT_ADDRESS = env.get('NFT_ADDRESS').required().asString()
const MINT_DATA = env.get('MINT_DATA').asString()
const ETHERSCAN_ENDPOINT = env.get('ETHERSCAN_ENDPOINT').default('https://api-goerli.etherscan.io').asString()
const ETHERSCAN_TOKEN = env.get('ETHERSCAN_TOKEN').default('').asString()
const CHAIN_ID = env.get('CHAIN_ID').default(5).asInt()
const BLOCKS_IN_FUTURE = env.get('BLOCKS_IN_FUTURE').default(1).asInt()
const provider = new providers.InfuraProvider(CHAIN_ID, process.env.INFURA_TOKEN)

// wallet keys
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY

let wallet: Wallet
let logger: Logger

function init() {
    var logFileName = process.platform == "win32" ? `log_${new Date().toISOString()}.txt`.replaceAll(':', '.') : `log_${new Date().toISOString()}.txt`
    var logFilepath = path.join(__dirname, "../", "logs", logFileName)

    logger = new MultiLogger([new ConsoleLogger(), new FileLogger(logFilepath)])


    if (WALLET_PRIVATE_KEY == undefined) {
        logger.error("Private key wallet undefined. Exiting.")
        process.exit(1)
    }
    wallet = new Wallet(WALLET_PRIVATE_KEY, provider)
}

function getTransaction(txdata: string, maxBaseFee: BigNumber): TransactionRequest {
    return {
        chainId: CHAIN_ID,
        type: 2,
        value: BigInt(NFT_PIECES_PER_MINT * NFT_PRICE_ETH * Math.pow(10, 18)),
        gasLimit: 400000,
        data: txdata,
        maxFeePerGas: BigInt(2000 * Math.pow(10,9)),// maxBaseFee.add(MINER_BRIBE_GWEI),
        maxPriorityFeePerGas: MINER_BRIBE_GWEI, // max priority fee == bribe
        to: NFT_ADDRESS,
    }
}

async function getNFTMintData(nftAdress: string): Promise<string> {
    const url = ETHERSCAN_ENDPOINT + '/api?module=contract&action=getabi&address=' + nftAdress + '&apikey=' + ETHERSCAN_TOKEN
    try {
        //const jsonAbi = await getContractABIJson(ETHERSCAN_ENDPOINT, nftAdress, ETHERSCAN_TOKEN)
        const jsonAbiPath = path.join(__dirname, "../", "contracts", "abis", "dinoBabies.json")
        const jsonAbi = JSON.parse(fs.readFileSync(jsonAbiPath).toString())
        const iface = new Interface(jsonAbi)
        const contract = new Contract(NFT_ADDRESS, iface, wallet)

        const hashedaValues = solidityKeccak256(["address", "uint256"], [wallet.publicKey, NFT_PIECES_PER_MINT])
        const arrayed = arrayify(hashedaValues)
        var signatureParameter = await wallet.signMessage(arrayify(hashedaValues))
        const data = await iface.encodeFunctionData("mint", [NFT_PIECES_PER_MINT, signatureParameter])
        return data

        // for (const element of jsonAbi) {
        //     if (element.hasOwnProperty("name") && element["name"].toLowerCase().includes("mint") && element.hasOwnProperty("stateMutability") && element["stateMutability"] === "payable") {
        //         const iface = new Interface(jsonAbi)
        //         const functionData = iface.getSighash(element["name"])
        //         // if there is only one input in the mint funciton, we assume it's the number of tokens we want to buy
        //         if (element.hasOwnProperty("inputs") && element["inputs"].length !== 0) {
        //             if (!element["inputs"].hasOwnProperty(1) && element["inputs"][0]["type"].includes('int')) {
        //                 // We get number of bit and divide by four to get the hex string that needs to be sent
        //                 const hexDigits: number = element["inputs"][0]["type"].replace('uint', '').replace('int', '') / 4
        //                 let hexData: string = padLeft(NFT_PIECES.toString(), hexDigits)
        //                 return functionData + hexData
        //             }
        //             else
        //                 throw new Error("Cannot figure out txData. User needs to provide it in manually. Aborting");
        //         }
        //         else {
        //             return functionData
        //         }
        //     }
        // }
    } catch (exception) {
        logger.error(JSON.stringify(exception))
    }
    logger.info("Could not find mint function.")
    return ""
}

async function main() {
    // Start Flashbots provider and get mint function data
    const transactionMintData = MINT_DATA ? MINT_DATA : await getNFTMintData(NFT_ADDRESS)
    if (transactionMintData === '') { return }

    const blockNumber = await provider.getBlockNumber()
    const block = await provider.getBlock(blockNumber)
    const maxBaseFeeInFutureBlock = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(BigNumber.from(block.baseFeePerGas), BLOCKS_IN_FUTURE)

    // Define multiple contracts or just a big one
    let bundledTransaction: (FlashbotsBundleTransaction | FlashbotsBundleRawTransaction)[] = []
    const contractsToMint = Number(NFT_PIECES_TOTAL) / Number(NFT_PIECES_PER_MINT)
    for (let index = 0; index < contractsToMint; index++) {
        var generatedTransaction = getTransaction(transactionMintData, maxBaseFeeInFutureBlock)
        bundledTransaction.push(
            {
                transaction: generatedTransaction,
                signer: wallet
            }
        )
    }

    wallet.sendTransaction(getTransaction())

    await sendFlasbhotTransaction(logger, bundledTransaction)
    exit(1)
}

init();
main();
