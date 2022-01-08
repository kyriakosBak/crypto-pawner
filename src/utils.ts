import { Interface } from "@ethersproject/abi";
import axios from "axios";
import * as fs from "fs"
import path from "path";
import dotenv from 'dotenv';
import * as env from 'env-var'
dotenv.config()

export const ETH = 10n ** 18n
export const GWEI = 10n ** 9n

export function padLeft(str: string | number, totalDigits: number, char: string = '0') {
    var paddedString = String(str)
    while (paddedString.length < totalDigits)
        paddedString = char + paddedString;
    return paddedString
}

export function padRight(str: string | number, totalDigits: number, char: string = '0') {
    var paddedString = String(str)
    while (paddedString.length < totalDigits)
        paddedString =  paddedString + char;
    return paddedString
}

export function getLogFilePath(filename: string)
{
    var logFileName = process.platform == "win32" ? `${filename}_${new Date().toISOString()}.txt`.replaceAll(':', '.') : `${filename}_${new Date().toISOString()}.txt`
    var logFilepath = path.join(__dirname, "../", "logs", logFileName)
    return logFilepath
}

export async function getContractABIJson(networkEndpoint: string, contractAddress: string, apikey: string): Promise<any> {
    const url = networkEndpoint + '/api?module=contract&action=getabi&address=' + contractAddress + '&apikey=' + apikey
    try {
        const response = await axios.get(url);
        if (response.status == 200) {
            return JSON.parse(response.data.result);
        }
        else {
            throw new Error(response.statusText)
        }
    } catch (exception) {
        throw new Error(JSON.stringify(exception));
    }
}

export function getFunctionABIByName(jsonAbi: any, functionName: string, isPayable: boolean = false): string {
    for (const element of jsonAbi) {
        if (element.hasOwnProperty("name") && element["name"].toLowerCase() === functionName) {
            if (!isPayable) {
                const iface = new Interface(jsonAbi)
                return iface.getSighash(element["name"])
            }
            else if (isPayable && element.hasOwnProperty("stateMutability") && element["stateMutability"] === "payable") {
                const iface = new Interface(jsonAbi)
                return iface.getSighash(element["name"])
            }
        }
    }
    return ""
}

export async function getInterface(abiFileNameOrAddress:string): Promise<Interface> {
    let jsonAbi: string
    // If address
    if (abiFileNameOrAddress.startsWith('0x')){
        const endPoint = env.get('ETHERSCAN_ENDPOINT').required().asString()
        const token = env.get('ETHERSCAN_TOKEN').required().asString()
        jsonAbi = await getContractABIJson(endPoint, abiFileNameOrAddress, token)
    }
    else{
        const jsonAbiPath = path.join(__dirname, "../", "contracts", "abis", abiFileNameOrAddress)
        jsonAbi = JSON.parse(fs.readFileSync(jsonAbiPath).toString())
    }
    return new Interface(jsonAbi)
}