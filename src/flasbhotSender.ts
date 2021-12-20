import dotenv from 'dotenv'
import * as env from 'env-var'
import { FlashbotsBundleProvider, FlashbotsBundleRawTransaction, FlashbotsBundleResolution, FlashbotsBundleTransaction, SimulationResponseSuccess } from "@flashbots/ethers-provider-bundle"
import { providers, Wallet } from 'ethers'
import { Logger } from './logger';

dotenv.config()

const CHAIN_ID = env.get('CHAIN_ID').default(5).asIntPositive()
const BLOCKS_IN_FUTURE = env.get('BLOCKS_IN_FUTURE').default(1).asIntPositive()
const INFURA_TOKEN = env.get('INFURA_TOKEN').required().asString()
const FLASHBOTS_ENDPOINT = env.get('FLASHBOTS_ENDPOINT').default('https://relay-goerli.flashbots.net').asString()
const authSigner = new Wallet(env.get('FLASBHOTS_PRIVATE_KEY').required().asString())

export async function sendFlasbhotTransaction(logger: Logger, txData: any[]): Promise<void> {
    // Start Flashbots provider and get mint function data
    const provider = new providers.InfuraProvider(CHAIN_ID, INFURA_TOKEN)
    const flashbotsProvider = await FlashbotsBundleProvider.create(provider, authSigner, FLASHBOTS_ENDPOINT)


    // Define multiple contracts or just a big one
    let bundledTransaction: (FlashbotsBundleTransaction | FlashbotsBundleRawTransaction)[] = []
    for (const tx of txData) {
        bundledTransaction.push(tx)
    }
    const blockNumber = await provider.getBlockNumber()
    const signedBundle = await flashbotsProvider.signBundle(bundledTransaction)
    for (let block = 0; block < BLOCKS_IN_FUTURE; block++) {
        logger.info('======================================');
        
        const simulation = await flashbotsProvider.simulate(signedBundle, blockNumber + BLOCKS_IN_FUTURE)
        if ('error' in simulation) {
            logger.error(`Simulation Error: ${simulation.error.message}`)
            continue
        } else {
            logger.debug(`Simulation Success: ${JSON.stringify(simulation, null, 2)}`)
        }

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
            if (CHAIN_ID == 1 && simulation as SimulationResponseSuccess) {
                logger.info(JSON.stringify(await flashbotsProvider.getBundleStats(simulation.bundleHash, targetBlock)))
                logger.info(JSON.stringify(await flashbotsProvider.getUserStats()))
            }
        }
    }
    return
}