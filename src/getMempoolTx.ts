import Web3 from 'web3'
import dotenv from 'dotenv';
import { getContractABIJson } from './utils';
import { Interface } from '@ethersproject/abi';
import { FileLogger } from './logger';
import path from 'path';

dotenv.config()

var url = "ws://localhost:8546"
//url = "wss://mainnet.infura.io/ws/v3/b544d3ce1d5747ffbfa113d47f215725"

var balancerContract = "0xBA12222222228d8Ba445958a75a0704d566BF2C8"

var options = {
    timeout: 30000,
    clientConfig: {
        maxReceivedFrameSize: 100000000,
        maxReceivedMessageSize: 100000000,
    },
    reconnect: {
        auto: true,
        delay: 5000,
        maxAttempts: 15,
        onTimeout: false,
    },
};

const web3 = new Web3(url)


const subscription = web3.eth.subscribe("pendingTransactions", (err: any, res: any) => {
    if (err) console.error(err);
});

async function init(): Promise<void> {
    // Get sighash of balancer swap function
    let endPoint = process.env.ETHERSCAN_ENDPOINT ? process.env.ETHERSCAN_ENDPOINT : "https://relay-goerli.flashbots.net"
    endPoint = "https://api.etherscan.io"
    const token = process.env.ETHERSCAN_TOKEN ? process.env.ETHERSCAN_TOKEN : ""
    const jsonAbi = await getContractABIJson(endPoint, balancerContract, token)

    const logger = new FileLogger(path.join(__dirname, "vault_abi.json"))
    logger.info(JSON.stringify(jsonAbi))

    let functionData: string
    for (const element of jsonAbi) {
        if (element.hasOwnProperty("name") && element["name"].toLowerCase() === "swap" && element.hasOwnProperty("stateMutability") && element["stateMutability"] === "payable") {
            const iface = new Interface(jsonAbi)
            functionData = iface.getSighash(element["name"])
        }
    }

    subscription.on("data", (txHash: any) => {
        setTimeout(async () => {
            try {
                let tx = await web3.eth.getTransaction(txHash);
                if (tx !== null && tx.input.startsWith(functionData))
                    console.log(tx)
            } catch (err) {
                console.error(err);
            }
        });
    });
};

init();