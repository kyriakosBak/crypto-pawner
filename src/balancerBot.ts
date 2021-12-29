import dotenv from 'dotenv'
import { TransactionRequest } from '@ethersproject/providers';
import { BigNumber, Contract, providers, Wallet } from 'ethers'
import path from 'path'
import { exit } from 'process'
import { ConsoleLogger, FileLogger, MultiLogger } from './logger'
import { getContractABIJson, getFunctionABIByName, ETH, GWEI } from './utils'
import * as fs from "fs"
import { Interface } from '@ethersproject/abi'
import { InfuraProvider, InfuraWebSocketProvider, WebSocketProvider } from '@ethersproject/providers'
import Web3 from 'web3'
import * as env from 'env-var'
import { EnvVarError } from 'env-var'
import { FlashbotsBundleProvider } from '@flashbots/ethers-provider-bundle'
const Tx = require('ethereumjs-tx').Transaction;

dotenv.config()

var logFileName = process.platform == "win32" ? `balancerBot_${new Date().toISOString()}.txt`.replaceAll(':', '.') : `balancerBot_${new Date().toISOString()}.txt`
const logger = new MultiLogger([new ConsoleLogger(), new FileLogger(path.join(__dirname, "../", "logs", logFileName))])

const vaultContractAddress = "0xBA12222222228d8Ba445958a75a0704d566BF2C8"

let SENDER_ADDRESS: string
let RECEIVER_ADDRESS: string
let CHAIN_ID: number
let MINER_BRIBE_GWEI: number
let BLOCKS_IN_FUTURE: number

let LIQUIDITY_POOL_ID: string
let TOKEN_AMOUNT_IN: number
let ASSET_IN_DECIMALS: number
let ASSET_OUT_DECIMALS: number

let BALANCE_IN: number
let WEIGHT_IN: number
let BALANCE_OUT: number
let WEIGHT_OUT: number
let SLIPPAGE: number
let WALLET: Wallet
let provider: InfuraProvider


function init() {
    try {
        CHAIN_ID = env.get('CHAIN_ID').default(5).asInt()
        MINER_BRIBE_GWEI = env.get('MINER_BRIBE_GWEI').required().asFloat()
        BLOCKS_IN_FUTURE = env.get('BLOCKS_IN_FUTURE').default(1).asInt()
        ASSET_IN_DECIMALS = env.get("ASSET_IN_DECIMALS").default('18').asInt()
        ASSET_OUT_DECIMALS = env.get("ASSET_OUT_DECIMALS").default('18').asInt()
        LIQUIDITY_POOL_ID = env.get('LIQUIDITY_POOL_ID').required().asString()
        TOKEN_AMOUNT_IN = env.get('TOKEN_AMOUNT_IN').required().asInt()
        BALANCE_IN = env.get('BALANCE_IN').required().asInt()
        WEIGHT_IN = env.get('WEIGHT_IN').required().asFloat()
        BALANCE_OUT = env.get('BALANCE_OUT').required().asInt()
        WEIGHT_OUT = env.get('WEIGHT_OUT').required().asFloat()
        SLIPPAGE = env.get('SLIPPAGE').required().asFloat()
        SENDER_ADDRESS = env.get('SENDER_ADDRESS').required().asString()
        RECEIVER_ADDRESS = env.get('RECEIVER_ADDRESS').required().asString()
        provider = new providers.InfuraProvider(CHAIN_ID, env.get('INFURA_TOKEN').asString())
        WALLET = new Wallet(env.get('WALLET_PRIVATE_KEY').required().asString(), provider)
    } catch (error) {
        logger.error((error as EnvVarError).message);
        exit(1)
    }
}

function getAmountOut(slippage: number, amountIn: number, balanceIn: number, weightIn: number, balanceOut: number, weightOut: number): number {
    // from white paper
    let BiDivBiAi = balanceIn / (balanceIn + amountIn)
    let amountOut = balanceOut * (1 - Math.pow(BiDivBiAi, (weightIn / weightOut)))
    return (1 - slippage) * amountOut
}

async function getSwapTXData(): Promise<string> {
    // Given liquidity pool contract, tokenAmountIn and slippage

    const balancerAbiPath = path.join(__dirname, "../", "contracts", "abis", "vault.json")
    const abiVault = JSON.parse(fs.readFileSync(balancerAbiPath).toString())
    const vaultInterface = new Interface(abiVault)
    const vaultContract = new Contract(vaultContractAddress, vaultInterface, provider)

    // get pool
    // const poolAbiPath = path.join(__dirname, "../", "contracts", "abis", "BPool.json")
    // const abiPool = JSON.parse(fs.readFileSync(poolAbiPath).toString())
    // const pool = await vaultContract.getPool(LIQUIDITY_POOL_ID)
    // const poolContractAddress: string = pool[0]
    // const poolInterface = new Interface(abiPool)
    // const poolContract = new Contract(poolContractAddress, poolInterface, wsProvider)
    // const weights = await poolContract.getSwapFee()

    // const decoded = vaultInterface.decodeFunctionData("swap", ethToDai)

    // get tokens
    const tokens = await vaultContract.getPoolTokens(LIQUIDITY_POOL_ID) // { tokens, balances, lastChangeBlock }
    let tokenOutLimit = getAmountOut(SLIPPAGE, TOKEN_AMOUNT_IN, BALANCE_IN, WEIGHT_IN, BALANCE_OUT, WEIGHT_OUT)
    console.log(tokens)

    // fund struct
    const fund_settings = {
        sender: SENDER_ADDRESS,
        fromInternalBalance: false,
        recipient: RECEIVER_ADDRESS,
        toInternalBalance: false
    };

    // swaps struct
    const ASSET_IN_DECIMALS = env.get("ASSET_IN_DECIMALS").default('18').asInt()
    const swap = {
        poolId: LIQUIDITY_POOL_ID,
        assetIn: tokens["tokens"][0].toLowerCase() as string,
        assetOut: tokens["tokens"][1].toLowerCase() as string,
        amount: TOKEN_AMOUNT_IN
    };
    // 0 = GIVEN_IN, 1 = GIVEN_OUT
    const swap_kind = 0;
    const swapStruct = {
        poolId: swap["poolId"],
        kind: swap_kind,
        assetIn: Web3.utils.toChecksumAddress(swap["assetIn"]),
        assetOut: Web3.utils.toChecksumAddress(swap["assetOut"]),
        amount: BigInt(swap["amount"]) * (10n ** BigInt(ASSET_IN_DECIMALS)),
        userData: '0x'
    }

    const deadline = "999999999999999999"

    const fundStruct = {
        sender: Web3.utils.toChecksumAddress(fund_settings["sender"]),
        fromInternalBalance: fund_settings["fromInternalBalance"],
        recipient: Web3.utils.toChecksumAddress(fund_settings["recipient"]),
        toInternalBalance: fund_settings["toInternalBalance"]
    }

    const transactionTokenLimit = BigInt(+tokenOutLimit.toFixed(ASSET_OUT_DECIMALS) * Math.pow(10, ASSET_OUT_DECIMALS))

    const web3 = new Web3(new Web3.providers.HttpProvider(env.get('INFURA_HTTP_PROVIDER').default("https://goerli.infura.io/v3/b544d3ce1d5747ffbfa113d47f215725").asString()))
    const contract_vault = new web3.eth.Contract(abiVault, vaultContractAddress);
    const single_swap_function = await contract_vault.methods.swap(swapStruct, fundStruct, transactionTokenLimit.toString(), deadline.toString())
    return single_swap_function.encodeABI()
}

async function main() {
    try {
        const txData = await getSwapTXData()

        const blockNumber = await provider.getBlockNumber()
        const block = await provider.getBlock(blockNumber)
        const maxBaseFeeInFutureBlock = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(BigNumber.from(block.baseFeePerGas), BLOCKS_IN_FUTURE)


        const txRequest: TransactionRequest = {
            chainId: CHAIN_ID,
            type: 2,
            data: txData,
            gasLimit: 200000,
            maxFeePerGas: maxBaseFeeInFutureBlock.add(BigInt(MINER_BRIBE_GWEI) * GWEI),
            maxPriorityFeePerGas: BigInt(MINER_BRIBE_GWEI) * GWEI, // max priority fee == bribe
            to: vaultContractAddress,
        }
        const txSigned = {
            transaction: txRequest,
            signer: WALLET
        }

        // Send simple transaction
        const web3 = new Web3(new Web3.providers.HttpProvider(env.get('INFURA_HTTP_PROVIDER').default("https://goerli.infura.io/v3/b544d3ce1d5747ffbfa113d47f215725").asString()))

        const tx_object = {
            'chainId': CHAIN_ID,
            'gas': web3.utils.toHex(200000),
            'gasPrice': web3.utils.toHex(web3.utils.toWei('3', 'gwei')),
            'nonce': await web3.eth.getTransactionCount(SENDER_ADDRESS),
            'data': txData,
            'to': vaultContractAddress
        };
        const tx = new Tx(tx_object)
        const signed_tx = await web3.eth.accounts.signTransaction(tx_object, env.get('WALLET_PRIVATE_KEY').required().asString())
        const send = web3.eth.sendSignedTransaction(signed_tx['rawTransaction'] as string);
        console.log(signed_tx)
        
        //await sendFlasbhotTransaction(logger, [txSigned])
        //console.log(txData)
    }
    catch (exception) {
        console.log(exception)
    }

    exit(0)
}

init()
main()