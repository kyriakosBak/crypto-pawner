import { BigNumber } from "@ethersproject/bignumber";
import path from "path";
import * as fs from "fs"
import { Contract, providers } from "ethers";
import { Interface } from "@ethersproject/abi";
import { WebSocketProvider } from "@ethersproject/providers";
import { ConsoleLogger, FileLogger, MultiLogger } from "./logger";
import { Console } from "console";

const vaultContractAddress = "0xBA12222222228d8Ba445958a75a0704d566BF2C8"
const data = '0x52bbbe2900000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000001d94b2612380854e74c32548d3ce47200000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001d94b2612380854e74c32548d3ce4720000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000043c33c1937564800000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffa30ac4a3bf3f680a29eb02238280c75acbb89d6d0002000000000000000000d30000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000aaef88cea01475125522e117bfe45cf32044e23800000000000000000000000000000000000000000000000000000009502f900000000000000000000000000000000000000000000000000000000000000000c00000000000000000000000000000000000000000000000000000000000000000'

async function main(): Promise<void> {

    console.log(BigNumber.from("0x19fd5aa8d76b").toString())

    var logger = new MultiLogger([new FileLogger(path.join(__dirname, "../", "logs", "shiba_token_owners.csv"))])

    const provider = new providers.InfuraProvider(1)
    // const provider = new WebSocketProvider("ws://127.0.0.1:8546", 1)
    // balancer 
    // const balancerAbiPath = path.join(__dirname, "../", "contracts", "abis", "vault.json")
    // const abiVault = JSON.parse(fs.readFileSync(balancerAbiPath).toString())
    // const vaultInterface = new Interface(abiVault)
    // const vaultContract = new Contract(vaultContractAddress, vaultInterface, provider)
    // const decodedData = vaultInterface.decodeFunctionData("swap", data)
    // console.log(decodedData)
    // console.log(BigNumber.from(decodedData["singleSwap"]["amount"]).toString())
    // console.log(BigNumber.from(decodedData["limit"]).toString())


    // shiba social club
    const shibaContractAddress = '0xD692cEd124A474f051f9744a301C26D1017B3D54'.toLowerCase()
    // console.log(await provider.getCode(shibaContractAddress))
    const shibaAbiPath = path.join(__dirname, "../", "contracts", "abis", "shibaSocialClub.json")
    const shibaAbi = JSON.parse(fs.readFileSync(shibaAbiPath).toString())
    const shibaInterface = new Interface(shibaAbi)
    const shibaContract = new Contract(shibaContractAddress, shibaInterface, provider)

    for (let i = 41; i < 7778; i++) {
        try {
            var owner = await shibaContract.functions.ownerOf(i)
            console.log('token ' + i.toString() + ' has owner ' + owner[0])
            logger.raw(`${i},${owner[0]}\n`)
            
        } catch (error) {
            // do nothing
            console.log('nothing for token ' + i.toString())
        }
        
    }

}

main()