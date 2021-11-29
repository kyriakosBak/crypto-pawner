export function padLeft(str: string | number, totalDigits: number, char: string = '0') {
    var paddedString = String(str)
    while (paddedString.length < totalDigits)
        paddedString = char + paddedString;
    return paddedString
}