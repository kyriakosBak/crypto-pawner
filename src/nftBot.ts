import { defaultAbiCoder, Interface } from '@ethersproject/abi';
import { TransactionRequest } from '@ethersproject/providers';
import { FlashbotsBundleProvider, FlashbotsBundleRawTransaction, FlashbotsBundleResolution, FlashbotsBundleTransaction } from '@flashbots/ethers-provider-bundle';
import dotenv from 'dotenv';
import * as env from 'env-var'
import { BigNumber, Contract, providers, utils, Wallet } from 'ethers';
import { arrayify, hexlify, id, keccak256, parseEther, solidityKeccak256, solidityPack, verifyMessage } from 'ethers/lib/utils';
import path from 'path';
import { exit } from 'process';
import { ConsoleLogger, FileLogger, Logger, MultiLogger } from './logger';
import * as fs from "fs"
import { ETH, getContractABIJson, getInterface, padLeft } from './utils';
import Web3 from 'web3';
import { sendFlasbhotTransaction } from './flasbhotSender';

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
const web3 = new Web3(new Web3.providers.HttpProvider(env.get('INFURA_HTTP_PROVIDER').default("https://goerli.infura.io/v3/b544d3ce1d5747ffbfa113d47f215725").asString()))

// wallet keys
const WALLET_PRIVATE_KEY = env.get("WALLET_PRIVATE_KEY").required().asString()

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
        maxFeePerGas: BigInt(2000 * Math.pow(10, 9)),// maxBaseFee.add(MINER_BRIBE_GWEI),
        maxPriorityFeePerGas: MINER_BRIBE_GWEI, // max priority fee == bribe
        to: NFT_ADDRESS,
    }
}

async function getNFTMintData(nftAddress: string): Promise<string> {
    const url = ETHERSCAN_ENDPOINT + '/api?module=contract&action=getabi&address=' + nftAddress + '&apikey=' + ETHERSCAN_TOKEN
    try {
        // const iface = await getInterface(nftAddress))
        const iface = await getInterface('dinoBabies.json')
        const contract = new Contract(NFT_ADDRESS, iface, wallet)

        // Get signature parameter
        var unpackedParameters = [["address", "uint256"], [env.get('WALLET_ADDRESS').required().asString(), NFT_PIECES_PER_MINT]]
        var packedData = solidityPack(["address", "uint256"], unpackedParameters[1])

        var ethersHashed = solidityKeccak256(["address", "uint256"], unpackedParameters[1])
        ethersHashed = keccak256(packedData)
        var ethersSig = await wallet.signMessage(ethersHashed)
        
        var web3sig = web3.eth.accounts.sign(packedData, WALLET_PRIVATE_KEY)

        console.log(web3.eth.accounts.recover(packedData, web3sig.signature))

        console.log(web3sig.signature == ethersSig)
        // let msgPrefix = "\x19Ethereum Signed Message:\n32";
        // var newHashed = Web3.utils.soliditySha3(msgPrefix, hashedValues) as string;
        
        //var sigNoArray = await wallet.signMessage(hashedValues)
        // var signatureParameter = await wallet.signMessage(arrayify(hashedValues))
        // var packedData = solidityPack(["address", "uint256"], [env.get('WALLET_ADDRESS').required().asString(), 2])
        // var web3sig = web3.eth.accounts.sign(packedData, WALLET_PRIVATE_KEY)
        // var verify = verifyMessage(hashedValues, signatureParameter)
        // console.log(verify)

        let params = [NFT_PIECES_PER_MINT, web3sig.signature]
        const data =    iface.encodeFunctionData("mint", params)

        return data

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


    const Tx = require('ethereumjs-tx').Transaction;

    // const tx_object = {
    //     'chainId': CHAIN_ID,
    //     'gas': 200000,
    //     'gasPrice': web3.utils.toHex(web3.utils.toWei('3', 'gwei')),
    //     'nonce': await wallet.getTransactionCount(),
    //     'data': await getNFTMintData(NFT_ADDRESS),
    //     'to': NFT_ADDRESS
    // };

    // const signed_tx = await web3.eth.accounts.signTransaction(tx_object, env.get('WALLET_PRIVATE_KEY').required().asString())
    // const send = web3.eth.sendSignedTransaction(signed_tx['rawTransaction'] as string, (e,h) => {console.log(e); console.log(h)});
    // console.log(signed_tx)
    await sendFlasbhotTransaction(logger, bundledTransaction)
}

init();
main();
