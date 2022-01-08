import { TransactionRequest } from '@ethersproject/providers';
import { FlashbotsBundleProvider, FlashbotsBundleRawTransaction, FlashbotsBundleTransaction } from '@flashbots/ethers-provider-bundle';
import dotenv from 'dotenv';
import * as env from 'env-var'
import { BigNumber, providers, Wallet } from 'ethers';
import { solidityKeccak256 } from 'ethers/lib/utils';
import { ConsoleLogger, FileLogger, Logger, MultiLogger } from './logger';
import { getInterface, getLogFilePath } from './utils';
import Web3 from 'web3';
import { sendFlasbhotTransaction } from './flasbhotSender';

dotenv.config()

const NFT_PRICE_ETH = env.get('NFT_PRICE_ETH').required().asFloat()
const NFT_PIECES_TOTAL = env.get('NFT_PIECES_TOTAL').required().asInt()
const NFT_PIECES_PER_MINT = env.get('NFT_PIECES_PER_MINT').required().asInt()
const MINER_BRIBE_GWEI = env.get('MINER_BRIBE_GWEI').default(2.000000001).asFloat()
const NFT_ADDRESS = env.get('NFT_ADDRESS').required().asString()
const MINT_DATA = env.get('MINT_DATA').asString()
const CHAIN_ID = env.get('CHAIN_ID').default(5).asInt()
const BLOCKS_IN_FUTURE = env.get('BLOCKS_IN_FUTURE').default(1).asInt()
const provider = new providers.InfuraProvider(CHAIN_ID, process.env.INFURA_TOKEN)
const WALLET_PRIVATE_KEY = env.get("WALLET_PRIVATE_KEY").required().asString()

let wallet: Wallet = new Wallet(WALLET_PRIVATE_KEY, provider)
let logger: Logger= new MultiLogger([new ConsoleLogger(), new FileLogger(getLogFilePath('nftBot'))])

function getTransaction(txdata: string, maxBaseFee: bigint): TransactionRequest {
    return {
        chainId: CHAIN_ID,
        type: 2,
        value: BigInt(NFT_PIECES_PER_MINT * NFT_PRICE_ETH * Math.pow(10, 18)),
        gasLimit: 400000,
        data: txdata,
        maxFeePerGas: maxBaseFee + BigInt(MINER_BRIBE_GWEI * Math.pow(10, 9)),
        maxPriorityFeePerGas: MINER_BRIBE_GWEI, // max priority fee == bribe
        to: NFT_ADDRESS,
    }
}

async function getNFTMintData(nftAddress: string): Promise<string> {

    let functionName = "mint"
    let params : any[] = [NFT_PIECES_PER_MINT]

    try {
        const iface = await getInterface(nftAddress)

        // Get signature parameter IF it does not get created server side
        // var ethersHashed = solidityKeccak256(["address", "uint256"], [wallet.address, NFT_PIECES_PER_MINT])
        // var web3sig = web3.eth.accounts.sign(ethersHashed, WALLET_PRIVATE_KEY)
        // params = [NFT_PIECES_PER_MINT, web3sig.signature]

        const data = iface.encodeFunctionData(functionName, params)

        return data
    } catch (exception) {
        logger.error(JSON.stringify(exception))
    }
    logger.info(`Could not find ${functionName} function.`)
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
        var generatedTransaction = getTransaction(transactionMintData, BigInt(maxBaseFeeInFutureBlock.toString()))
        bundledTransaction.push(
            {
                transaction: generatedTransaction,
                signer: wallet
            }
        )
    }

    // ========== Mempool tx ==========
    // const web3 = new Web3(new Web3.providers.HttpProvider(env.get('INFURA_HTTP_PROVIDER').default("https://goerli.infura.io/v3/b544d3ce1d5747ffbfa113d47f215725").asString()))
    // const Tx = require('ethereumjs-tx').Transaction;
    // const tx_object = {
    //     'chainId': CHAIN_ID,
    //     'gas': 200000,
    //     'gasPrice': web3.utils.toHex(web3.utils.toWei('1', 'gwei')),
    //     'nonce': await wallet.getTransactionCount(),
    //     'data': await getNFTMintData(NFT_ADDRESS),
    //     'to': NFT_ADDRESS,
    //     'value': BigInt(0.1 * Math.pow(10,18)).toString()
    // };

    // const signed_tx = await web3.eth.accounts.signTransaction(tx_object, wallet.privateKey)
    // const send = web3.eth.sendSignedTransaction(signed_tx['rawTransaction'] as string, (e,h) => {console.log(e); console.log(h)});
    // console.log(signed_tx)

    // ========== Flasbhot tx ==========
    await sendFlasbhotTransaction(logger, bundledTransaction)
}

main();
