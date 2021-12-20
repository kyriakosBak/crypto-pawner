import { Interface } from "@ethersproject/abi";
import axios from "axios";
import { error } from "console";

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