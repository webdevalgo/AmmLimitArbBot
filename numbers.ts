import { convertDecimals } from "./_shared";

function sqrt(value: bigint) {
    if (value < 0n) {
        throw 'square root of negative numbers is not supported'
    }

    if (value < 2n) {
        return value;
    }

    function newtonIteration(n: bigint, x0: bigint) {
        const x1 = ((n / x0) + x0) >> 1n;
        if (x0 === x1 || x0 === (x1 - 1n)) {
            return x0;
        }
        return newtonIteration(n, x1);
    }

    return newtonIteration(value, 1n);
}

export function calculateSwappableAmountA(xBalance: bigint | number, yBalance: bigint | number, xDecimals: number, yDecimals: number, requiredPrice: number) {
    const SCALE_DECIMALS = 6;

    xBalance = convertDecimals(BigInt(xBalance), xDecimals, SCALE_DECIMALS);
    yBalance = convertDecimals(BigInt(yBalance), yDecimals, SCALE_DECIMALS);

    const r = ((((yBalance * BigInt(1e6)) - xBalance * BigInt(Math.floor(requiredPrice * 1e6))) / BigInt(Math.floor(requiredPrice * 1e6))) / 2n);

    return r > 0n ? r : 0n;
}

export function calculateSwappableAmountB(xBalance: bigint | number, yBalance: bigint | number, xDecimals: number, yDecimals: number, requiredPrice: number) {
    const SCALE_DECIMALS = 18;

    xBalance = convertDecimals(BigInt(xBalance), xDecimals, SCALE_DECIMALS);
    yBalance = convertDecimals(BigInt(yBalance), yDecimals, SCALE_DECIMALS);


    const SCALE = 10n ** BigInt(SCALE_DECIMALS);

    const p = sqrt(BigInt(Math.floor(requiredPrice * Number(SCALE))) * SCALE);

    const a = sqrt(xBalance * yBalance);
    const b = (xBalance * p) / SCALE;

    const r = ((a - b) * SCALE) / p;

    if (r > 0n) {
        return convertDecimals(r, SCALE_DECIMALS, xDecimals);
    }

    return 0n;
}

export function calculateSwappableAmount(xBalance: bigint | number, yBalance: bigint | number, xDecimals: number, yDecimals: number, requiredPrice: number) {
    const a = calculateSwappableAmountA(xBalance, yBalance, xDecimals, yDecimals, requiredPrice);
    const b = calculateSwappableAmountB(xBalance, yBalance, xDecimals, yDecimals, requiredPrice);

    // return (a + b) / 2n;
    return b;
}

// // 200 100 => price is 0.5 Y / 1 X
// // 200 100 => price is 0.5 Y / 1 X
// const xBalance = 10_227.774;
// const yBalance = 10_003.386;
// const xDecimals = 6;
// const yDecimals = 6;
// console.log(Number(calculateSwappableAmount(
//     BigInt(Math.floor(xBalance * 1e6)) * (10n ** BigInt(xDecimals)) / BigInt(1e6),
//     BigInt(Math.floor(yBalance * 1e6)) * (10n ** BigInt(yDecimals)) / BigInt(1e6),
//     xDecimals,
//     yDecimals,
//     1
// )).toLocaleString('en'));

// console.log(Number(calculateSwappableAmount2(
//     BigInt(Math.floor(xBalance * 1e6)) * (10n ** BigInt(xDecimals)) / BigInt(1e6),
//     BigInt(Math.floor(yBalance * 1e6)) * (10n ** BigInt(yDecimals)) / BigInt(1e6),
//     xDecimals,
//     yDecimals,
//     1
// )).toLocaleString('en'));

// console.log(Number(calculateSwappableAmount(
//     BigInt(Math.floor(yBalance * 1e6)) * (10n ** BigInt(yDecimals)) / BigInt(1e6),
//     BigInt(Math.floor(xBalance * 1e6)) * (10n ** BigInt(xDecimals)) / BigInt(1e6),
//     yDecimals,
//     xDecimals,
//     1
// )).toLocaleString('en'));

// console.log(Number(calculateSwappableAmount2(
//     BigInt(Math.floor(yBalance * 1e6)) * (10n ** BigInt(yDecimals)) / BigInt(1e6),
//     BigInt(Math.floor(xBalance * 1e6)) * (10n ** BigInt(xDecimals)) / BigInt(1e6),
//     yDecimals,
//     xDecimals,
//     1
// )).toLocaleString('en'));