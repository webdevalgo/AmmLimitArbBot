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

const SCALE = 100_000_000_000_000n;

export function calculateOutTokens(inAmount: bigint, inSupply: bigint, outSupply: bigint, fee: bigint) {
    const factor = SCALE - fee;
    return (inAmount * outSupply * factor) / ((inAmount + inSupply) * SCALE);
}

export function calculateInTokens(outAmount: bigint, inSupply: bigint, outSupply: bigint, fee: bigint) {
    const factor = SCALE - fee;
    const inAmount = (SCALE * inSupply * outAmount) / (outSupply * factor - outAmount * SCALE);
    if (inAmount > 0n) {
        return inAmount;
    }
    return BigInt(Number.MAX_SAFE_INTEGER) * BigInt(Number.MAX_SAFE_INTEGER);
}

// MAX Swappable
export function calculateSwappableAmountMax(xSupply: bigint, ySupply: bigint, xDecimals: number, yDecimals: number, targetPrice: number) {
    const SCALE_DECIMALS = 6;
    xSupply = convertDecimals(BigInt(xSupply), xDecimals, SCALE_DECIMALS);
    ySupply = convertDecimals(BigInt(ySupply), yDecimals, SCALE_DECIMALS);

    let step = convertDecimals(1, 0, SCALE_DECIMALS + 6);

    let lastX = 0n;
    let lastY = 0n;
    let x = 0n;
    let y = 0n;
    let p = 0;

    let count = 0;

    while (step > 1_000n) {

        do {
            if (count++ > 1000_000) return 0n;
            lastX = x;
            lastY = y;
            x += step;
            y = calculateOutTokens(x, xSupply, ySupply, 1_000_000_000_000n);
            p = x === 0n ? 0 : Number(y) / Number(x);
        } while (p >= targetPrice);

        x = lastX;
        // if (p < 1) {
        //     console.log(p, targetPrice, (Number(lastX) / 1e6).toLocaleString('en'), (Number(lastY) / 1e6).toLocaleString('en'));
        // }
        step = step / 10n;
    }


    if (lastY > 0n) {
        return convertDecimals(lastX, SCALE_DECIMALS, xDecimals);
    }

    return 0n;
}

export function calculateSwappableAmountSupply(xSupply: bigint, ySupply: bigint, xDecimals: number, yDecimals: number, targetPrice: number) {
    const SCALE_DECIMALS = 6;
    xSupply = convertDecimals(BigInt(xSupply), xDecimals, SCALE_DECIMALS);
    ySupply = convertDecimals(BigInt(ySupply), yDecimals, SCALE_DECIMALS);

    let step = convertDecimals(1, 0, SCALE_DECIMALS + 6);

    let lastX = 0n;
    let lastY = 0n;
    let x = 0n;
    let y = 0n;
    let p = 0;

    let count = 0;

    while (step > 1_000n) {

        do {
            if (count++ > 1000_000) return 0n;
            lastX = x;
            lastY = y;
            x += step;
            y = calculateOutTokens(x, xSupply, ySupply, 1_000_000_000_000n);
            p = x === 0n ? 0 : Number(ySupply - y) / Number(xSupply + x);
        } while (p >= targetPrice);

        x = lastX;
        // if (p < 1) {
        //     console.log(p, targetPrice, (Number(lastX) / 1e6).toLocaleString('en'), (Number(lastY) / 1e6).toLocaleString('en'));
        // }
        step = step / 10n;
    }


    if (lastY > 0n) {
        return convertDecimals(lastX, SCALE_DECIMALS, xDecimals);
    }

    return 0n;
}

export function calculateSwappableAmount(xSupply: bigint, ySupply: bigint, xDecimals: number, yDecimals: number, targetPrice: number) {
    const pa = calculateSwappableAmountMax(xSupply, ySupply, xDecimals, yDecimals, targetPrice);
    const pb = calculateSwappableAmountSupply(xSupply, ySupply, xDecimals, yDecimals, targetPrice);

    return pa < pb ? pa : pb;
}


// console.log(calculateSwappableAmount(1_844_455_407_000n, 4_042_281_975_000n, 6, 6, 1));
