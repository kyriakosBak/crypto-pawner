import { providers } from 'ethers';
import dotenv from 'dotenv';
import { ConsoleLogger, FileLogger } from './logger';

dotenv.config()
const CHAIN_ID = 1

interface Person {
    name: string,
    age: number
}

class Greek implements Person {
    name: string;
    age: number;

    constructor(name: string, age: number) {
        this.name = name
        this.age = age
    }
}

async function main() {

    let p: Person = new Greek('john', 100)

    console.log(p)
    let logger = new ConsoleLogger()
    logger.info(JSON.stringify(p))


    return;

    const provider = new providers.InfuraProvider(CHAIN_ID, process.env.INFURA_TOKEN)
    const response = await provider.getBlockWithTransactions(13406272)
    //console.log(response.transactions)

    for (const tx of response.transactions) {
        console.log(`transaction: ${tx.hash} ...gasPrice: ${tx.gasPrice}...maxPriorityFee: ${tx.maxPriorityFeePerGas}...maxFeePerGas: ${tx.maxPriorityFeePerGas}`);

    }
}

main()