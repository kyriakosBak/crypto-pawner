import { Interface } from '@ethersproject/abi';
import { TransactionRequest } from '@ethersproject/providers';
import { FlashbotsBundleProvider, FlashbotsBundleResolution } from '@flashbots/ethers-provider-bundle';
import axios from 'axios';
import dotenv from 'dotenv';
import { BigNumber, providers, Wallet } from 'ethers';
import { exit } from 'process';

const GWEI = BigNumber.from(10).pow(9)
const ETH = BigNumber.from(10).pow(18)

dotenv.config()
const NFT_VALUE = ETH.div(100).mul(8)
const NFT_PIECES = BigNumber.from(process.env.NFT_PIECES)
const MINER_BRIBE_GWEI = GWEI.mul(BigNumber.from(process.env.MINER_BRIBE_GWEI))

const NFT_ADDRESS = process.env.NFT_ADDRESS
const MINT_DATA = process.env.MINT_DATA
const FLASHBOTS_ENDPOINT = process.env.FLASHBOTS_ENDPOINT ? process.env.FLASHBOTS_ENDPOINT : "https://relay-goerli.flashbots.net"
const ETHERSCAN_ENDPOINT = process.env.ETHERSCAN_ENDPOINT ? process.env.ETHERSCAN_ENDPOINT : "https://api-goerli.etherscan.io"
const ETHERSCAN_TOKEN = process.env.ETHERSCAN_TOKEN
const CHAIN_ID = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : 5
const BLOCKS_IN_FUTURE = process.env.BLOCKS_IN_FUTURE ? Number(process.env.BLOCKS_IN_FUTURE) : 1
const provider = new providers.InfuraProvider(CHAIN_ID) // TODO - set infura token

// wallet keys
const FLASBHOTS_PRIVATE_KEY = process.env.FLASBHOTS_PRIVATE_KEY
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY

function runENVChecks() {

    if (FLASBHOTS_PRIVATE_KEY == undefined) {
        console.error("Flasbhots key undefined. Exiting")
        process.exit(1)
    }

    if (ETHERSCAN_TOKEN == undefined) {
        console.error("Etherscan token undefined. Exiting")
        process.exit(1)
    }

    if (WALLET_PRIVATE_KEY == undefined) {
        console.error("Private key wallet undefined. Exiting.")
        process.exit(1)
    }

    if (process.env.NFT_ADDRESS == undefined) {
        console.error("NFT Contract undefined. Exiting.")
        process.exit(1)
    }
}

function getTransaction(txdata: string, maxBaseFee: BigNumber): TransactionRequest {
    return {
        chainId: CHAIN_ID,
        type: 2,
        value: NFT_VALUE,
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

                // TODO - Handle case where there is no inputs and we can only mint 1

                // if there is only one input in the mint funciton, we assume it's the number of tokens we want to buy
                if (element.hasOwnProperty("inputs") && !element.hasOwnProperty(1) && element["inputs"][0]["type"].includes('int')) {
                    // We get number of bit and divide by four to get the hex string that needs to be sent
                    const hexDigits: number = element["inputs"][0]["type"].replace('uint', '').replace('int', '') / 4
                    let hexData: string = NFT_PIECES.toString()
                    while (hexData.length < hexDigits) {
                        hexData = '0' + hexData
                    }
                    return functionData + hexData
                }
                else {
                    throw new Error("Cannot figure out txData. User need to give it in manually. Aborting");
                }
            }
        }
    } catch (exception) {
        process.stderr.write(`ERROR received from ${url}: ${exception}\n`);
    }
    console.log("Could not find mint function.")
    return ""
}

async function main() {
    // Init wallets
    const authSigner = new Wallet(FLASBHOTS_PRIVATE_KEY)
    if (WALLET_PRIVATE_KEY == undefined)
        return
    const wallet = new Wallet(WALLET_PRIVATE_KEY, provider)

    // Start Flashbots provider and get mint function data
    const flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner, FLASHBOTS_ENDPOINT)
    const transactionData = MINT_DATA ? MINT_DATA : await getNFTMintData(NFT_ADDRESS)
    if (transactionData === '') { return }

    // Start executing for each block
    provider.on('block', async (blockNumber) => {
        console.log(blockNumber)
        const block = await provider.getBlock(blockNumber)
        const maxBaseFeeInFutureBlock = FlashbotsBundleProvider.getMaxBaseFeeInFutureBlock(BigNumber.from(block.baseFeePerGas), BLOCKS_IN_FUTURE)
        const tx = getTransaction(transactionData, maxBaseFeeInFutureBlock)
        const bundledTransaction =
            [
                {
                    transaction: getTransaction(transactionData, maxBaseFeeInFutureBlock),
                    signer: wallet
                },
                {
                    transaction: getTransaction(transactionData, maxBaseFeeInFutureBlock),
                    signer: wallet
                }
            ]
        const signedBundle = await flashbotsProvider.signBundle(bundledTransaction)
        const simulation = await flashbotsProvider.simulate(signedBundle, blockNumber + BLOCKS_IN_FUTURE)
        if ('error' in simulation) {
            console.warn(`Simulation Error: ${simulation.error.message}`)
            process.exit(1)
        } else {
            console.log(`Simulation Success: ${JSON.stringify(simulation, null, 2)}`)
        }

        const balanceBefore = await wallet.getBalance()
        for (let block = 1; block < 10; block++) {
            const bundleSubmission = await flashbotsProvider.sendBundle(bundledTransaction, blockNumber + block)
            if ('error' in bundleSubmission) {
                console.warn(bundleSubmission.error.message)
                throw new Error(bundleSubmission.error.message);
            }
            const waitResponse = await bundleSubmission.wait()
            console.log(`Wait Response: ${FlashbotsBundleResolution[waitResponse]}`)

            if (waitResponse === FlashbotsBundleResolution.BundleIncluded || waitResponse === FlashbotsBundleResolution.AccountNonceTooHigh) {
                process.exit(0)
            } else {
                console.log({
                    //bundleStats: await flashbotsProvider.getBundleStats(simulation.bundleHash, blockNumber + BLOCKS_IN_FUTURE),
                    //userStats: await flashbotsProvider.getUserStats()
                })
            }
        }
        console.log('Balance lost = ' + balanceBefore.sub(await wallet.getBalance()).toString())
        exit(1)
    })
}

runENVChecks();
main();