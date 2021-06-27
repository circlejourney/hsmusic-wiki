// Syntactic sugar! (Mostly.)
// Generic functions - these are useful just a8out everywhere.
//
// Friendly(!) disclaimer: these utility functions haven't 8een tested all that
// much. Do not assume it will do exactly what you want it to do in all cases.
// It will likely only do exactly what I want it to, and only in the cases I
// decided were relevant enough to 8other handling.

// Apparently JavaScript doesn't come with a function to split an array into
// chunks! Weird. Anyway, this is an awesome place to use a generator, even
// though we don't really make use of the 8enefits of generators any time we
// actually use this. 8ut it's still awesome, 8ecause I say so.
export function* splitArray(array, fn) {
    let lastIndex = 0;
    while (lastIndex < array.length) {
        let nextIndex = array.findIndex((item, index) => index >= lastIndex && fn(item));
        if (nextIndex === -1) {
            nextIndex = array.length;
        }
        yield array.slice(lastIndex, nextIndex);
        // Plus one because we don't want to include the dividing line in the
        // next array we yield.
        lastIndex = nextIndex + 1;
    }
};

export const mapInPlace = (array, fn) => array.splice(0, array.length, ...array.map(fn));

export const filterEmptyLines = string => string.split('\n').filter(line => line.trim()).join('\n');

export const unique = arr => Array.from(new Set(arr));

// Stolen from jq! Which pro8a8ly stole the concept from other places. Nice.
export const withEntries = (obj, fn) => Object.fromEntries(fn(Object.entries(obj)));

// Nothin' more to it than what it says. Runs a function in-place. Provides an
// altern8tive syntax to the usual IIFEs (e.g. (() => {})()) when you want to
// open a scope and run some statements while inside an existing expression.
export const call = fn => fn();

export function queue(array, max = 50) {
    if (max === 0) {
        return array.map(fn => fn());
    }

    const begin = [];
    let current = 0;
    const ret = array.map(fn => new Promise((resolve, reject) => {
        begin.push(() => {
            current++;
            Promise.resolve(fn()).then(value => {
                current--;
                if (current < max && begin.length) {
                    begin.shift()();
                }
                resolve(value);
            }, reject);
        });
    }));

    for (let i = 0; i < max && begin.length; i++) {
        begin.shift()();
    }

    return ret;
}

export function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
}

// Stolen from here: https://stackoverflow.com/a/3561711
//
// There's a proposal for a native JS function like this, 8ut it's not even
// past stage 1 yet: https://github.com/tc39/proposal-regex-escaping
export function escapeRegex(string) {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export function bindOpts(fn, bind) {
    const bindIndex = bind[bindOpts.bindIndex] ?? 1;

    return (...args) => {
        const opts = args[bindIndex] ?? {};
        return fn(...args.slice(0, bindIndex), {...bind, ...opts});
    };
}

bindOpts.bindIndex = Symbol();

// Utility function for providing useful interfaces to the JS AggregateError
// class.
//
// Generally, this works by returning a set of interfaces which operate on
// functions: wrap() takes a function and returns a new function which passes
// its arguments through and appends any resulting error to the internal error
// list; call() simplifies this process by wrapping the provided function and
// then calling it immediately. Once the process for which errors should be
// aggregated is complete, close() constructs and throws an AggregateError
// object containing all caught errors (or doesn't throw anything if there were
// no errors).
export function openAggregate({
    // Constructor to use, defaulting to the builtin AggregateError class.
    // Anything passed here should probably extend from that! May be used for
    // letting callers programatically distinguish between multiple aggregate
    // errors.
    //
    // This should be provided using the aggregateThrows utility function.
    [openAggregate.errorClassSymbol]: errorClass = AggregateError,

    // Optional human-readable message to describe the aggregate error, if
    // constructed.
    message = '',

    // Value to return when a provided function throws an error. If this is a
    // function, it will be called with the arguments given to the function.
    // (This is primarily useful when wrapping a function and then providing it
    // to another utility, e.g. array.map().)
    returnOnFail = null
} = {}) {
    const errors = [];

    const aggregate = {};

    aggregate.wrap = fn => (...args) => {
        try {
            return fn(...args);
        } catch (error) {
            errors.push(error);
            return (typeof returnOnFail === 'function'
                ? returnOnFail(...args)
                : returnOnFail);
        }
    };

    aggregate.call = (fn, ...args) => {
        return aggregate.wrap(fn)(...args);
    };

    aggregate.nest = (...args) => {
        return aggregate.call(() => withAggregate(...args));
    };

    aggregate.map = (...args) => {
        const parent = aggregate;
        const { result, aggregate: child } = mapAggregate(...args);
        parent.call(child.close);
        return result;
    };

    aggregate.filter = (...args) => {
        const parent = aggregate;
        const { result, aggregate: child } = filterAggregate(...args);
        parent.call(child.close);
        return result;
    };

    aggregate.throws = aggregateThrows;

    aggregate.close = () => {
        if (errors.length) {
            throw Reflect.construct(errorClass, [errors, message]);
        }
    };

    return aggregate;
}

openAggregate.errorClassSymbol = Symbol('error class');

// Utility function for providing {errorClass} parameter to aggregate functions.
export function aggregateThrows(errorClass) {
    return {[openAggregate.errorClassSymbol]: errorClass};
}

// Performs an ordinary array map with the given function, collating into a
// results array (with errored inputs filtered out) and an error aggregate.
//
// Optionally, override returnOnFail to disable filtering and map errored inputs
// to a particular output.
//
// Note the aggregate property is the result of openAggregate(), still unclosed;
// use aggregate.close() to throw the error. (This aggregate may be passed to a
// parent aggregate: `parent.call(aggregate.close)`!)
export function mapAggregate(array, fn, aggregateOpts) {
    const failureSymbol = Symbol();

    const aggregate = openAggregate({
        returnOnFail: failureSymbol,
        ...aggregateOpts
    });

    const result = array.map(aggregate.wrap(fn))
        .filter(value => value !== failureSymbol);

    return {result, aggregate};
}

// Performs an ordinary array filter with the given function, collating into a
// results array (with errored inputs filtered out) and an error aggregate.
//
// Optionally, override returnOnFail to disable filtering errors and map errored
// inputs to a particular output.
//
// As with mapAggregate, the returned aggregate property is not yet closed.
export function filterAggregate(array, fn, aggregateOpts) {
    const failureSymbol = Symbol();

    const aggregate = openAggregate({
        returnOnFail: failureSymbol,
        ...aggregateOpts
    });

    const result = array.map(aggregate.wrap((x, ...rest) => ({
        input: x,
        output: fn(x, ...rest)
    })))
        .filter(value => {
            // Filter out results which match the failureSymbol, i.e. errored
            // inputs.
            if (value === failureSymbol) return false;

            // Always keep results which match the overridden returnOnFail
            // value, if provided.
            if (value === aggregateOpts.returnOnFail) return true;

            // Otherwise, filter according to the returned value of the wrapped
            // function.
            return value.output;
        })
        .map(value => {
            // Then turn the results back into their corresponding input, or, if
            // provided, the overridden returnOnFail value.
            return (value === aggregateOpts.returnOnFail
                ? value
                : value.input);
        });

    return {result, aggregate};
}

// Totally sugar function for opening an aggregate, running the provided
// function with it, then closing the function and returning the result (if
// there's no throw).
export function withAggregate(aggregateOpts, fn) {
    if (typeof aggregateOpts === 'function') {
        fn = aggregateOpts;
        aggregateOpts = {};
    }

    const aggregate = openAggregate(aggregateOpts);
    const result = fn(aggregate);
    aggregate.close();
    return result;
}

export function showAggregate(topError) {
    const recursive = error => {
        const header = `[${error.constructor.name || 'unnamed'}] ${error.message || '(no message)'}`;
        if (error instanceof AggregateError) {
            return header + '\n' + (error.errors
                .map(recursive)
                .flatMap(str => str.split('\n'))
                .map(line => ` | ` + line)
                .join('\n'));
        } else {
            return header;
        }
    };

    console.log(recursive(topError));
}
