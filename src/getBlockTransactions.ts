import { providers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config()
const CHAIN_ID = 1

async function main() {
    const provider = new providers.InfuraProvider(CHAIN_ID, process.env.INFURA_TOKEN)
    const response = await provider.getBlockWithTransactions(13406272)
    //console.log(response.transactions)

    for (const tx of response.transactions) {
        console.log(`transaction: ${tx.hash} ...gasPrice: ${tx.gasPrice}...maxPriorityFee: ${tx.maxPriorityFeePerGas}...maxFeePerGas: ${tx.maxPriorityFeePerGas}`);

    }
}

main()