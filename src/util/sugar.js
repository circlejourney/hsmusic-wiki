/** @format */

// Syntactic sugar! (Mostly.)
// Generic functions - these are useful just a8out everywhere.
//
// Friendly(!) disclaimer: these utility functions haven't 8een tested all that
// much. Do not assume it will do exactly what you want it to do in all cases.
// It will likely only do exactly what I want it to, and only in the cases I
// decided were relevant enough to 8other handling.

import {color} from './cli.js';

// Apparently JavaScript doesn't come with a function to split an array into
// chunks! Weird. Anyway, this is an awesome place to use a generator, even
// though we don't really make use of the 8enefits of generators any time we
// actually use this. 8ut it's still awesome, 8ecause I say so.
export function* splitArray(array, fn) {
  let lastIndex = 0;
  while (lastIndex < array.length) {
    let nextIndex = array.findIndex(
      (item, index) => index >= lastIndex && fn(item)
    );
    if (nextIndex === -1) {
      nextIndex = array.length;
    }
    yield array.slice(lastIndex, nextIndex);
    // Plus one because we don't want to include the dividing line in the
    // next array we yield.
    lastIndex = nextIndex + 1;
  }
}

export const mapInPlace = (array, fn) =>
  array.splice(0, array.length, ...array.map(fn));

export const filterEmptyLines = (string) =>
  string
    .split('\n')
    .filter((line) => line.trim())
    .join('\n');

export const unique = (arr) => Array.from(new Set(arr));

export const compareArrays = (arr1, arr2, {checkOrder = true} = {}) =>
  arr1.length === arr2.length &&
  (checkOrder
    ? arr1.every((x, i) => arr2[i] === x)
    : arr1.every((x) => arr2.includes(x)));

// Stolen from jq! Which pro8a8ly stole the concept from other places. Nice.
export const withEntries = (obj, fn) =>
  Object.fromEntries(fn(Object.entries(obj)));

export function queue(array, max = 50) {
  if (max === 0) {
    return array.map((fn) => fn());
  }

  const begin = [];
  let current = 0;
  const ret = array.map(
    (fn) =>
      new Promise((resolve, reject) => {
        begin.push(() => {
          current++;
          Promise.resolve(fn()).then((value) => {
            current--;
            if (current < max && begin.length) {
              begin.shift()();
            }
            resolve(value);
          }, reject);
        });
      })
  );

  for (let i = 0; i < max && begin.length; i++) {
    begin.shift()();
  }

  return ret;
}

export function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

// Stolen from here: https://stackoverflow.com/a/3561711
//
// There's a proposal for a native JS function like this, 8ut it's not even
// past stage 1 yet: https://github.com/tc39/proposal-regex-escaping
export function escapeRegex(string) {
  return string.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export function bindOpts(fn, bind) {
  const bindIndex = bind[bindOpts.bindIndex] ?? 1;

  const bound = function (...args) {
    const opts = args[bindIndex] ?? {};
    return fn(...args.slice(0, bindIndex), {...bind, ...opts});
  };

  Object.defineProperty(bound, 'name', {
    value: fn.name ? `(options-bound) ${fn.name}` : `(options-bound)`,
  });

  return bound;
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
  returnOnFail = null,
} = {}) {
  const errors = [];

  const aggregate = {};

  aggregate.wrap =
    (fn) =>
    (...args) => {
      try {
        return fn(...args);
      } catch (error) {
        errors.push(error);
        return typeof returnOnFail === 'function'
          ? returnOnFail(...args)
          : returnOnFail;
      }
    };

  aggregate.wrapAsync =
    (fn) =>
    (...args) => {
      return fn(...args).then(
        (value) => value,
        (error) => {
          errors.push(error);
          return typeof returnOnFail === 'function'
            ? returnOnFail(...args)
            : returnOnFail;
        }
      );
    };

  aggregate.call = (fn, ...args) => {
    return aggregate.wrap(fn)(...args);
  };

  aggregate.callAsync = (fn, ...args) => {
    return aggregate.wrapAsync(fn)(...args);
  };

  aggregate.nest = (...args) => {
    return aggregate.call(() => withAggregate(...args));
  };

  aggregate.nestAsync = (...args) => {
    return aggregate.callAsync(() => withAggregateAsync(...args));
  };

  aggregate.map = (...args) => {
    const parent = aggregate;
    const {result, aggregate: child} = mapAggregate(...args);
    parent.call(child.close);
    return result;
  };

  aggregate.mapAsync = async (...args) => {
    const parent = aggregate;
    const {result, aggregate: child} = await mapAggregateAsync(...args);
    parent.call(child.close);
    return result;
  };

  aggregate.filter = (...args) => {
    const parent = aggregate;
    const {result, aggregate: child} = filterAggregate(...args);
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
  return _mapAggregate('sync', null, array, fn, aggregateOpts);
}

export function mapAggregateAsync(
  array,
  fn,
  {promiseAll = Promise.all.bind(Promise), ...aggregateOpts} = {}
) {
  return _mapAggregate('async', promiseAll, array, fn, aggregateOpts);
}

// Helper function for mapAggregate which holds code common between sync and
// async versions.
export function _mapAggregate(mode, promiseAll, array, fn, aggregateOpts) {
  const failureSymbol = Symbol();

  const aggregate = openAggregate({
    returnOnFail: failureSymbol,
    ...aggregateOpts,
  });

  if (mode === 'sync') {
    const result = array
      .map(aggregate.wrap(fn))
      .filter((value) => value !== failureSymbol);
    return {result, aggregate};
  } else {
    return promiseAll(array.map(aggregate.wrapAsync(fn))).then((values) => {
      const result = values.filter((value) => value !== failureSymbol);
      return {result, aggregate};
    });
  }
}

// Performs an ordinary array filter with the given function, collating into a
// results array (with errored inputs filtered out) and an error aggregate.
//
// Optionally, override returnOnFail to disable filtering errors and map errored
// inputs to a particular output.
//
// As with mapAggregate, the returned aggregate property is not yet closed.
export function filterAggregate(array, fn, aggregateOpts) {
  return _filterAggregate('sync', null, array, fn, aggregateOpts);
}

export async function filterAggregateAsync(
  array,
  fn,
  {promiseAll = Promise.all.bind(Promise), ...aggregateOpts} = {}
) {
  return _filterAggregate('async', promiseAll, array, fn, aggregateOpts);
}

// Helper function for filterAggregate which holds code common between sync and
// async versions.
function _filterAggregate(mode, promiseAll, array, fn, aggregateOpts) {
  const failureSymbol = Symbol();

  const aggregate = openAggregate({
    returnOnFail: failureSymbol,
    ...aggregateOpts,
  });

  function filterFunction(value) {
    // Filter out results which match the failureSymbol, i.e. errored
    // inputs.
    if (value === failureSymbol) return false;

    // Always keep results which match the overridden returnOnFail
    // value, if provided.
    if (value === aggregateOpts.returnOnFail) return true;

    // Otherwise, filter according to the returned value of the wrapped
    // function.
    return value.output;
  }

  function mapFunction(value) {
    // Then turn the results back into their corresponding input, or, if
    // provided, the overridden returnOnFail value.
    return value === aggregateOpts.returnOnFail ? value : value.input;
  }

  if (mode === 'sync') {
    const result = array
      .map(
        aggregate.wrap((input, index, array) => {
          const output = fn(input, index, array);
          return {input, output};
        })
      )
      .filter(filterFunction)
      .map(mapFunction);

    return {result, aggregate};
  } else {
    return promiseAll(
      array.map(
        aggregate.wrapAsync(async (input, index, array) => {
          const output = await fn(input, index, array);
          return {input, output};
        })
      )
    ).then((values) => {
      const result = values.filter(filterFunction).map(mapFunction);

      return {result, aggregate};
    });
  }
}

// Totally sugar function for opening an aggregate, running the provided
// function with it, then closing the function and returning the result (if
// there's no throw).
export function withAggregate(aggregateOpts, fn) {
  return _withAggregate('sync', aggregateOpts, fn);
}

export function withAggregateAsync(aggregateOpts, fn) {
  return _withAggregate('async', aggregateOpts, fn);
}

export function _withAggregate(mode, aggregateOpts, fn) {
  if (typeof aggregateOpts === 'function') {
    fn = aggregateOpts;
    aggregateOpts = {};
  }

  const aggregate = openAggregate(aggregateOpts);

  if (mode === 'sync') {
    const result = fn(aggregate);
    aggregate.close();
    return result;
  } else {
    return fn(aggregate).then((result) => {
      aggregate.close();
      return result;
    });
  }
}

export function showAggregate(
  topError,
  {pathToFile = (p) => p, showTraces = true} = {}
) {
  const recursive = (error, {level}) => {
    let header = showTraces
      ? `[${error.constructor.name || 'unnamed'}] ${
          error.message || '(no message)'
        }`
      : error instanceof AggregateError
      ? `[${error.message || '(no message)'}]`
      : error.message || '(no message)';
    if (showTraces) {
      const stackLines = error.stack?.split('\n');
      const stackLine = stackLines?.find(
        (line) =>
          line.trim().startsWith('at') &&
          !line.includes('sugar') &&
          !line.includes('node:') &&
          !line.includes('<anonymous>')
      );
      const tracePart = stackLine
        ? '- ' +
          stackLine
            .trim()
            .replace(/file:\/\/(.*\.js)/, (match, pathname) =>
              pathToFile(pathname)
            )
        : '(no stack trace)';
      header += ` ${color.dim(tracePart)}`;
    }
    const bar = level % 2 === 0 ? '\u2502' : color.dim('\u254e');
    const head = level % 2 === 0 ? '\u257f' : color.dim('\u257f');

    if (error instanceof AggregateError) {
      return (
        header +
        '\n' +
        error.errors
          .map((error) => recursive(error, {level: level + 1}))
          .flatMap((str) => str.split('\n'))
          .map((line, i) => i === 0 ? ` ${head} ${line}` : ` ${bar} ${line}`)
          .join('\n')
      );
    } else {
      return header;
    }
  };

  console.error(recursive(topError, {level: 0}));
}

export function decorateErrorWithIndex(fn) {
  return (x, index, array) => {
    try {
      return fn(x, index, array);
    } catch (error) {
      error.message = `(${color.yellow(`#${index + 1}`)}) ${error.message}`;
      throw error;
    }
  };
}
