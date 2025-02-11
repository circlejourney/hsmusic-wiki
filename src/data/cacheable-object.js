/**
 * @format
 */

// Generally extendable class for caching properties and handling dependencies,
// with a few key properties:
//
// 1) The behavior of every property is defined by its descriptor, which is a
//    static value stored on the subclass (all instances share the same property
//    descriptors).
//
//  1a) Additional properties may not be added past the time of object
//      construction, and attempts to do so (including externally setting a
//      property name which has no corresponding descriptor) will throw a
//      TypeError. (This is done via an Object.seal(this) call after a newly
//      created instance defines its own properties according to the descriptor
//      on its constructor class.)
//
// 2) Properties may have two flags set: update and expose. Properties which
//    update are provided values from the external. Properties which expose
//    provide values to the external, generally dependent on other update
//    properties (within the same object).
//
//  2a) Properties may be flagged as both updating and exposing. This is so
//      that the same name may be used for both "output" and "input".
//
// 3) Exposed properties have values which are computations dependent on other
//    properties, as described by a `compute` function on the descriptor.
//    Depended-upon properties are explicitly listed on the descriptor next to
//    this function, and are only provided as arguments to the function once
//    listed.
//
//  3a) An exposed property may depend only upon updating properties, not other
//      exposed properties (within the same object). This is to force the
//      general complexity of a single object to be fairly simple: inputs
//      directly determine outputs, with the only in-between step being the
//      `compute` function, no multiple-layer dependencies. Note that this is
//      only true within a given object - externally, values provided to one
//      object's `update` may be (and regularly are) the exposed values of
//      another object.
//
//  3b) If a property both updates and exposes, it is automatically regarded as
//      a dependancy. (That is, its exposed value will depend on the value it is
//      updated with.) Rather than a required `compute` function, these have an
//      optional `transform` function, which takes the update value as its first
//      argument and then the usual key-value dependencies as its second. If no
//      `transform` function is provided, the expose value is the same as the
//      update value.
//
// 4) Exposed properties are cached; that is, if no depended-upon properties are
//    updated, the value of an exposed property is not recomputed.
//
//  4a) The cache for an exposed property is invalidated as soon as any of its
//      dependencies are updated, but the cache itself is lazy: the exposed
//      value will not be recomputed until it is again accessed. (Likewise, an
//      exposed value won't be computed for the first time until it is first
//      accessed.)
//
// 5) Updating a property may optionally apply validation checks before passing,
//    declared by a `validate` function on the `update` block. This function
//    should either throw an error (e.g. TypeError) or return false if the value
//    is invalid.
//
// 6) Objects do not expect all updating properties to be provided at once.
//    Incomplete objects are deliberately supported and enabled.
//
//  6a) The default value for every updating property is null; undefined is not
//      accepted as a property value under any circumstances (it always errors).
//      However, this default may be overridden by specifying a `default` value
//      on a property's `update` block. (This value will be checked against
//      the property's validate function.) Note that a property may always be
//      updated to null, even if the default is non-null. (Null always bypasses
//      the validate check.)
//
//  6b) It's required by the external consumer of an object to determine whether
//      or not the object is ready for use (within the larger program). This is
//      convenienced by the static CacheableObject.listAccessibleProperties()
//      function, which provides a mapping of exposed property names to whether
//      or not their dependencies are yet met.

import {color, ENABLE_COLOR} from '../util/cli.js';

import {inspect as nodeInspect} from 'util';

function inspect(value) {
  return nodeInspect(value, {colors: ENABLE_COLOR});
}

export default class CacheableObject {
  static instance = Symbol('CacheableObject `this` instance');

  #propertyUpdateValues = Object.create(null);
  #propertyUpdateCacheInvalidators = Object.create(null);

  /*
    // Note the constructor doesn't take an initial data source. Due to a quirk
    // of JavaScript, private members can't be accessed before the superclass's
    // constructor is finished processing - so if we call the overridden
    // update() function from inside this constructor, it will error when
    // writing to private members. Pretty bad!
    //
    // That means initial data must be provided by following up with update()
    // after constructing the new instance of the Thing (sub)class.
    */

  constructor() {
    this.#defineProperties();
    this.#initializeUpdatingPropertyValues();

    if (CacheableObject.DEBUG_SLOW_TRACK_INVALID_PROPERTIES) {
      return new Proxy(this, {
        get: (obj, key) => {
          if (!Object.hasOwn(obj, key)) {
            if (key !== 'constructor') {
              CacheableObject._invalidAccesses.add(
                `(${obj.constructor.name}).${key}`
              );
            }
          }
          return obj[key];
        },
      });
    }
  }

  #initializeUpdatingPropertyValues() {
    for (const [property, descriptor] of Object.entries(
      this.constructor.propertyDescriptors
    )) {
      const {flags, update} = descriptor;

      if (!flags.update) {
        continue;
      }

      if (update?.default) {
        this[property] = update?.default;
      } else {
        this[property] = null;
      }
    }
  }

  #defineProperties() {
    if (!this.constructor.propertyDescriptors) {
      throw new Error(
        `Expected constructor ${this.constructor.name} to define propertyDescriptors`
      );
    }

    for (const [property, descriptor] of Object.entries(
      this.constructor.propertyDescriptors
    )) {
      const {flags} = descriptor;

      const definition = {
        configurable: false,
        enumerable: true,
      };

      if (flags.update) {
        definition.set =
          this.#getUpdateObjectDefinitionSetterFunction(property);
      }

      if (flags.expose) {
        definition.get =
          this.#getExposeObjectDefinitionGetterFunction(property);
      }

      Object.defineProperty(this, property, definition);
    }

    Object.seal(this);
  }

  #getUpdateObjectDefinitionSetterFunction(property) {
    const {update} = this.#getPropertyDescriptor(property);
    const validate = update?.validate;

    return (newValue) => {
      const oldValue = this.#propertyUpdateValues[property];

      if (newValue === undefined) {
        throw new TypeError(`Properties cannot be set to undefined`);
      }

      if (newValue === oldValue) {
        return;
      }

      if (newValue !== null && validate) {
        try {
          const result = validate(newValue);
          if (result === undefined) {
            throw new TypeError(`Validate function returned undefined`);
          } else if (result !== true) {
            throw new TypeError(`Validation failed for value ${newValue}`);
          }
        } catch (error) {
          error.message = `Property ${color.green(property)} (${inspect(
            this[property]
          )} -> ${inspect(newValue)}): ${error.message}`;
          throw error;
        }
      }

      this.#propertyUpdateValues[property] = newValue;
      this.#invalidateCachesDependentUpon(property);
    };
  }

  #getPropertyDescriptor(property) {
    return this.constructor.propertyDescriptors[property];
  }

  #invalidateCachesDependentUpon(property) {
    for (const invalidate of this.#propertyUpdateCacheInvalidators[property] ||
      []) {
      invalidate();
    }
  }

  #getExposeObjectDefinitionGetterFunction(property) {
    const {flags} = this.#getPropertyDescriptor(property);
    const compute = this.#getExposeComputeFunction(property);

    if (compute) {
      let cachedValue;
      const checkCacheValid = this.#getExposeCheckCacheValidFunction(property);
      return () => {
        if (checkCacheValid()) {
          return cachedValue;
        } else {
          return (cachedValue = compute());
        }
      };
    } else if (!flags.update && !compute) {
      throw new Error(
        `Exposed property ${property} does not update and is missing compute function`
      );
    } else {
      return () => this.#propertyUpdateValues[property];
    }
  }

  #getExposeComputeFunction(property) {
    const {flags, expose} = this.#getPropertyDescriptor(property);

    const compute = expose?.compute;
    const transform = expose?.transform;

    if (flags.update && !transform) {
      return null;
    } else if (flags.update && compute) {
      throw new Error(
        `Updating property ${property} has compute function, should be formatted as transform`
      );
    } else if (!flags.update && !compute) {
      throw new Error(
        `Exposed property ${property} does not update and is missing compute function`
      );
    }

    const dependencyKeys = expose.dependencies || [];
    const dependencyGetters = dependencyKeys.map((key) => () => [
      key,
      this.#propertyUpdateValues[key],
    ]);
    const getAllDependencies = () =>
      Object.fromEntries(
        dependencyGetters
          .map((f) => f())
          .concat([[this.constructor.instance, this]])
      );

    if (flags.update) {
      return () =>
        transform(this.#propertyUpdateValues[property], getAllDependencies());
    } else {
      return () => compute(getAllDependencies());
    }
  }

  #getExposeCheckCacheValidFunction(property) {
    const {flags, expose} = this.#getPropertyDescriptor(property);

    let valid = false;

    const invalidate = () => {
      valid = false;
    };

    const dependencyKeys = new Set(expose?.dependencies);

    if (flags.update) {
      dependencyKeys.add(property);
    }

    for (const key of dependencyKeys) {
      if (this.#propertyUpdateCacheInvalidators[key]) {
        this.#propertyUpdateCacheInvalidators[key].push(invalidate);
      } else {
        this.#propertyUpdateCacheInvalidators[key] = [invalidate];
      }
    }

    return () => {
      if (!valid) {
        valid = true;
        return false;
      } else {
        return true;
      }
    };
  }

  static cacheAllExposedProperties(obj) {
    if (!(obj instanceof CacheableObject)) {
      console.warn('Not a CacheableObject:', obj);
      return;
    }

    if (!obj.constructor.propertyDescriptors) {
      console.warn('Missing property descriptors:', obj);
      return;
    }

    for (const [property, descriptor] of Object.entries(
      obj.constructor.propertyDescriptors
    )) {
      const {flags} = descriptor;

      if (!flags.expose) {
        continue;
      }

      obj[property];
    }
  }

  static DEBUG_SLOW_TRACK_INVALID_PROPERTIES = false;
  static _invalidAccesses = new Set();

  static showInvalidAccesses() {
    if (!this.DEBUG_SLOW_TRACK_INVALID_PROPERTIES) {
      return;
    }

    if (!this._invalidAccesses.size) {
      return;
    }

    console.log(`${this._invalidAccesses.size} unique invalid accesses:`);
    for (const line of this._invalidAccesses) {
      console.log(` - ${line}`);
    }
  }
}
