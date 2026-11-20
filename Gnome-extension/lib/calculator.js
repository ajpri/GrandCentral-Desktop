// SPDX-License-Identifier: GPL-3.0-or-later
// A small arithmetic parser. Never evaluate JavaScript entered by the user.
export function calculate(input) {
    if (!input.trim())
        return 0;
    if (input.length > 512)
        throw new Error('Expression is too long');
    const expression = input.replaceAll('×', '*').replaceAll('÷', '/').replaceAll('−', '-');
    const tokens = [];
    let position = 0;
    while (position < expression.length) {
        const remainder = expression.slice(position);
        const match = /^(\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|sqrt|[()+\-*/^%])/.exec(remainder);
        if (!match)
            throw new Error('Use numbers and arithmetic operators');
        position += match[0].length;
        if (match[0].trim())
            tokens.push(match[0]);
    }
    let index = 0;
    const take = token => tokens[index] === token ? (index++, true) : false;
    const checked = value => {
        if (!Number.isFinite(value))
            throw new Error('Result is outside the supported range');
        return value;
    };
    function primary() {
        if (take('(')) {
            const value = sum();
            if (!take(')'))
                throw new Error('Close the parenthesis');
            return value;
        }
        if (take('sqrt')) {
            if (!take('('))
                throw new Error('Use sqrt(number)');
            const value = sum();
            if (!take(')'))
                throw new Error('Close the parenthesis');
            if (value < 0)
                throw new Error('Cannot take the square root of a negative number');
            return Math.sqrt(value);
        }
        const token = tokens[index++];
        if (!token || !/^[\d.]/.test(token))
            throw new Error('Enter a number');
        return checked(Number(token));
    }
    function postfix() {
        let value = primary();
        while (take('%'))
            value /= 100;
        return value;
    }
    function power() {
        const value = postfix();
        return take('^') ? checked(value ** unary()) : value;
    }
    function unary() {
        if (take('+'))
            return unary();
        if (take('-'))
            return -unary();
        return power();
    }
    function product() {
        let value = unary();
        while (index < tokens.length) {
            if (take('*')) {
                value = checked(value * unary());
            } else if (take('/')) {
                const divisor = unary();
                if (divisor === 0)
                    throw new Error('Cannot divide by zero');
                value = checked(value / divisor);
            } else {
                break;
            }
        }
        return value;
    }
    function sum() {
        let value = product();
        while (index < tokens.length) {
            if (take('+'))
                value = checked(value + product());
            else if (take('-'))
                value = checked(value - product());
            else
                break;
        }
        return value;
    }
    const result = sum();
    if (index !== tokens.length)
        throw new Error('Check the operators and parentheses');
    return checked(result);
}

export function formatResult(value) {
    return Object.is(value, -0) ? '0' : String(Number(value.toPrecision(12)));
}
