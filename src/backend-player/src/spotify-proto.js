/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars*/
"use strict";

var $protobuf = require("protobufjs/minimal");

// Common aliases
var $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;

// Exported root namespace
var $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

$root.spotify = (function() {

    /**
     * Namespace spotify.
     * @exports spotify
     * @namespace
     */
    var spotify = {};

    spotify.login5 = (function() {

        /**
         * Namespace login5.
         * @memberof spotify
         * @namespace
         */
        var login5 = {};

        login5.v3 = (function() {

            /**
             * Namespace v3.
             * @memberof spotify.login5
             * @namespace
             */
            var v3 = {};

            /**
             * LoginError enum.
             * @name spotify.login5.v3.LoginError
             * @enum {number}
             * @property {number} UNKNOWN_ERROR=0 UNKNOWN_ERROR value
             * @property {number} INVALID_CREDENTIALS=1 INVALID_CREDENTIALS value
             * @property {number} BAD_REQUEST=2 BAD_REQUEST value
             * @property {number} UNSUPPORTED_LOGIN_PROTOCOL=3 UNSUPPORTED_LOGIN_PROTOCOL value
             * @property {number} TIMEOUT=4 TIMEOUT value
             * @property {number} UNKNOWN_IDENTIFIER=5 UNKNOWN_IDENTIFIER value
             * @property {number} TOO_MANY_ATTEMPTS=6 TOO_MANY_ATTEMPTS value
             * @property {number} INVALID_PHONENUMBER=7 INVALID_PHONENUMBER value
             * @property {number} TRY_AGAIN_LATER=8 TRY_AGAIN_LATER value
             */
            v3.LoginError = (function() {
                var valuesById = {}, values = Object.create(valuesById);
                values[valuesById[0] = "UNKNOWN_ERROR"] = 0;
                values[valuesById[1] = "INVALID_CREDENTIALS"] = 1;
                values[valuesById[2] = "BAD_REQUEST"] = 2;
                values[valuesById[3] = "UNSUPPORTED_LOGIN_PROTOCOL"] = 3;
                values[valuesById[4] = "TIMEOUT"] = 4;
                values[valuesById[5] = "UNKNOWN_IDENTIFIER"] = 5;
                values[valuesById[6] = "TOO_MANY_ATTEMPTS"] = 6;
                values[valuesById[7] = "INVALID_PHONENUMBER"] = 7;
                values[valuesById[8] = "TRY_AGAIN_LATER"] = 8;
                return values;
            })();

            v3.Challenges = (function() {

                /**
                 * Properties of a Challenges.
                 * @memberof spotify.login5.v3
                 * @interface IChallenges
                 * @property {Array.<spotify.login5.v3.IChallenge>|null} [challenges] Challenges challenges
                 */

                /**
                 * Constructs a new Challenges.
                 * @memberof spotify.login5.v3
                 * @classdesc Represents a Challenges.
                 * @implements IChallenges
                 * @constructor
                 * @param {spotify.login5.v3.IChallenges=} [properties] Properties to set
                 */
                function Challenges(properties) {
                    this.challenges = [];
                    if (properties)
                        for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null)
                                this[keys[i]] = properties[keys[i]];
                }

                /**
                 * Challenges challenges.
                 * @member {Array.<spotify.login5.v3.IChallenge>} challenges
                 * @memberof spotify.login5.v3.Challenges
                 * @instance
                 */
                Challenges.prototype.challenges = $util.emptyArray;

                /**
                 * Creates a new Challenges instance using the specified properties.
                 * @function create
                 * @memberof spotify.login5.v3.Challenges
                 * @static
                 * @param {spotify.login5.v3.IChallenges=} [properties] Properties to set
                 * @returns {spotify.login5.v3.Challenges} Challenges instance
                 */
                Challenges.create = function create(properties) {
                    return new Challenges(properties);
                };

                /**
                 * Encodes the specified Challenges message. Does not implicitly {@link spotify.login5.v3.Challenges.verify|verify} messages.
                 * @function encode
                 * @memberof spotify.login5.v3.Challenges
                 * @static
                 * @param {spotify.login5.v3.IChallenges} message Challenges message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                Challenges.encode = function encode(message, writer) {
                    if (!writer)
                        writer = $Writer.create();
                    if (message.challenges != null && message.challenges.length)
                        for (var i = 0; i < message.challenges.length; ++i)
                            $root.spotify.login5.v3.Challenge.encode(message.challenges[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                    return writer;
                };

                /**
                 * Encodes the specified Challenges message, length delimited. Does not implicitly {@link spotify.login5.v3.Challenges.verify|verify} messages.
                 * @function encodeDelimited
                 * @memberof spotify.login5.v3.Challenges
                 * @static
                 * @param {spotify.login5.v3.IChallenges} message Challenges message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                Challenges.encodeDelimited = function encodeDelimited(message, writer) {
                    return this.encode(message, writer).ldelim();
                };

                /**
                 * Decodes a Challenges message from the specified reader or buffer.
                 * @function decode
                 * @memberof spotify.login5.v3.Challenges
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @param {number} [length] Message length if known beforehand
                 * @returns {spotify.login5.v3.Challenges} Challenges
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                Challenges.decode = function decode(reader, length) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.Challenges();
                    while (reader.pos < end) {
                        var tag = reader.uint32();
                        switch (tag >>> 3) {
                        case 1: {
                                if (!(message.challenges && message.challenges.length))
                                    message.challenges = [];
                                message.challenges.push($root.spotify.login5.v3.Challenge.decode(reader, reader.uint32()));
                                break;
                            }
                        default:
                            reader.skipType(tag & 7);
                            break;
                        }
                    }
                    return message;
                };

                /**
                 * Decodes a Challenges message from the specified reader or buffer, length delimited.
                 * @function decodeDelimited
                 * @memberof spotify.login5.v3.Challenges
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @returns {spotify.login5.v3.Challenges} Challenges
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                Challenges.decodeDelimited = function decodeDelimited(reader) {
                    if (!(reader instanceof $Reader))
                        reader = new $Reader(reader);
                    return this.decode(reader, reader.uint32());
                };

                /**
                 * Verifies a Challenges message.
                 * @function verify
                 * @memberof spotify.login5.v3.Challenges
                 * @static
                 * @param {Object.<string,*>} message Plain object to verify
                 * @returns {string|null} `null` if valid, otherwise the reason why it is not
                 */
                Challenges.verify = function verify(message) {
                    if (typeof message !== "object" || message === null)
                        return "object expected";
                    if (message.challenges != null && message.hasOwnProperty("challenges")) {
                        if (!Array.isArray(message.challenges))
                            return "challenges: array expected";
                        for (var i = 0; i < message.challenges.length; ++i) {
                            var error = $root.spotify.login5.v3.Challenge.verify(message.challenges[i]);
                            if (error)
                                return "challenges." + error;
                        }
                    }
                    return null;
                };

                /**
                 * Creates a Challenges message from a plain object. Also converts values to their respective internal types.
                 * @function fromObject
                 * @memberof spotify.login5.v3.Challenges
                 * @static
                 * @param {Object.<string,*>} object Plain object
                 * @returns {spotify.login5.v3.Challenges} Challenges
                 */
                Challenges.fromObject = function fromObject(object) {
                    if (object instanceof $root.spotify.login5.v3.Challenges)
                        return object;
                    var message = new $root.spotify.login5.v3.Challenges();
                    if (object.challenges) {
                        if (!Array.isArray(object.challenges))
                            throw TypeError(".spotify.login5.v3.Challenges.challenges: array expected");
                        message.challenges = [];
                        for (var i = 0; i < object.challenges.length; ++i) {
                            if (typeof object.challenges[i] !== "object")
                                throw TypeError(".spotify.login5.v3.Challenges.challenges: object expected");
                            message.challenges[i] = $root.spotify.login5.v3.Challenge.fromObject(object.challenges[i]);
                        }
                    }
                    return message;
                };

                /**
                 * Creates a plain object from a Challenges message. Also converts values to other types if specified.
                 * @function toObject
                 * @memberof spotify.login5.v3.Challenges
                 * @static
                 * @param {spotify.login5.v3.Challenges} message Challenges
                 * @param {$protobuf.IConversionOptions} [options] Conversion options
                 * @returns {Object.<string,*>} Plain object
                 */
                Challenges.toObject = function toObject(message, options) {
                    if (!options)
                        options = {};
                    var object = {};
                    if (options.arrays || options.defaults)
                        object.challenges = [];
                    if (message.challenges && message.challenges.length) {
                        object.challenges = [];
                        for (var j = 0; j < message.challenges.length; ++j)
                            object.challenges[j] = $root.spotify.login5.v3.Challenge.toObject(message.challenges[j], options);
                    }
                    return object;
                };

                /**
                 * Converts this Challenges to JSON.
                 * @function toJSON
                 * @memberof spotify.login5.v3.Challenges
                 * @instance
                 * @returns {Object.<string,*>} JSON object
                 */
                Challenges.prototype.toJSON = function toJSON() {
                    return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                };

                /**
                 * Gets the default type url for Challenges
                 * @function getTypeUrl
                 * @memberof spotify.login5.v3.Challenges
                 * @static
                 * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                 * @returns {string} The default type url
                 */
                Challenges.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                    if (typeUrlPrefix === undefined) {
                        typeUrlPrefix = "type.googleapis.com";
                    }
                    return typeUrlPrefix + "/spotify.login5.v3.Challenges";
                };

                return Challenges;
            })();

            v3.Challenge = (function() {

                /**
                 * Properties of a Challenge.
                 * @memberof spotify.login5.v3
                 * @interface IChallenge
                 * @property {spotify.login5.v3.challenges.IHashcashChallenge|null} [hashcash] Challenge hashcash
                 * @property {spotify.login5.v3.challenges.ICodeChallenge|null} [code] Challenge code
                 */

                /**
                 * Constructs a new Challenge.
                 * @memberof spotify.login5.v3
                 * @classdesc Represents a Challenge.
                 * @implements IChallenge
                 * @constructor
                 * @param {spotify.login5.v3.IChallenge=} [properties] Properties to set
                 */
                function Challenge(properties) {
                    if (properties)
                        for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null)
                                this[keys[i]] = properties[keys[i]];
                }

                /**
                 * Challenge hashcash.
                 * @member {spotify.login5.v3.challenges.IHashcashChallenge|null|undefined} hashcash
                 * @memberof spotify.login5.v3.Challenge
                 * @instance
                 */
                Challenge.prototype.hashcash = null;

                /**
                 * Challenge code.
                 * @member {spotify.login5.v3.challenges.ICodeChallenge|null|undefined} code
                 * @memberof spotify.login5.v3.Challenge
                 * @instance
                 */
                Challenge.prototype.code = null;

                /**
                 * Creates a new Challenge instance using the specified properties.
                 * @function create
                 * @memberof spotify.login5.v3.Challenge
                 * @static
                 * @param {spotify.login5.v3.IChallenge=} [properties] Properties to set
                 * @returns {spotify.login5.v3.Challenge} Challenge instance
                 */
                Challenge.create = function create(properties) {
                    return new Challenge(properties);
                };

                /**
                 * Encodes the specified Challenge message. Does not implicitly {@link spotify.login5.v3.Challenge.verify|verify} messages.
                 * @function encode
                 * @memberof spotify.login5.v3.Challenge
                 * @static
                 * @param {spotify.login5.v3.IChallenge} message Challenge message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                Challenge.encode = function encode(message, writer) {
                    if (!writer)
                        writer = $Writer.create();
                    if (message.hashcash != null && Object.hasOwnProperty.call(message, "hashcash"))
                        $root.spotify.login5.v3.challenges.HashcashChallenge.encode(message.hashcash, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                    if (message.code != null && Object.hasOwnProperty.call(message, "code"))
                        $root.spotify.login5.v3.challenges.CodeChallenge.encode(message.code, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
                    return writer;
                };

                /**
                 * Encodes the specified Challenge message, length delimited. Does not implicitly {@link spotify.login5.v3.Challenge.verify|verify} messages.
                 * @function encodeDelimited
                 * @memberof spotify.login5.v3.Challenge
                 * @static
                 * @param {spotify.login5.v3.IChallenge} message Challenge message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                Challenge.encodeDelimited = function encodeDelimited(message, writer) {
                    return this.encode(message, writer).ldelim();
                };

                /**
                 * Decodes a Challenge message from the specified reader or buffer.
                 * @function decode
                 * @memberof spotify.login5.v3.Challenge
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @param {number} [length] Message length if known beforehand
                 * @returns {spotify.login5.v3.Challenge} Challenge
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                Challenge.decode = function decode(reader, length) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.Challenge();
                    while (reader.pos < end) {
                        var tag = reader.uint32();
                        switch (tag >>> 3) {
                        case 1: {
                                message.hashcash = $root.spotify.login5.v3.challenges.HashcashChallenge.decode(reader, reader.uint32());
                                break;
                            }
                        case 2: {
                                message.code = $root.spotify.login5.v3.challenges.CodeChallenge.decode(reader, reader.uint32());
                                break;
                            }
                        default:
                            reader.skipType(tag & 7);
                            break;
                        }
                    }
                    return message;
                };

                /**
                 * Decodes a Challenge message from the specified reader or buffer, length delimited.
                 * @function decodeDelimited
                 * @memberof spotify.login5.v3.Challenge
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @returns {spotify.login5.v3.Challenge} Challenge
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                Challenge.decodeDelimited = function decodeDelimited(reader) {
                    if (!(reader instanceof $Reader))
                        reader = new $Reader(reader);
                    return this.decode(reader, reader.uint32());
                };

                /**
                 * Verifies a Challenge message.
                 * @function verify
                 * @memberof spotify.login5.v3.Challenge
                 * @static
                 * @param {Object.<string,*>} message Plain object to verify
                 * @returns {string|null} `null` if valid, otherwise the reason why it is not
                 */
                Challenge.verify = function verify(message) {
                    if (typeof message !== "object" || message === null)
                        return "object expected";
                    if (message.hashcash != null && message.hasOwnProperty("hashcash")) {
                        var error = $root.spotify.login5.v3.challenges.HashcashChallenge.verify(message.hashcash);
                        if (error)
                            return "hashcash." + error;
                    }
                    if (message.code != null && message.hasOwnProperty("code")) {
                        var error = $root.spotify.login5.v3.challenges.CodeChallenge.verify(message.code);
                        if (error)
                            return "code." + error;
                    }
                    return null;
                };

                /**
                 * Creates a Challenge message from a plain object. Also converts values to their respective internal types.
                 * @function fromObject
                 * @memberof spotify.login5.v3.Challenge
                 * @static
                 * @param {Object.<string,*>} object Plain object
                 * @returns {spotify.login5.v3.Challenge} Challenge
                 */
                Challenge.fromObject = function fromObject(object) {
                    if (object instanceof $root.spotify.login5.v3.Challenge)
                        return object;
                    var message = new $root.spotify.login5.v3.Challenge();
                    if (object.hashcash != null) {
                        if (typeof object.hashcash !== "object")
                            throw TypeError(".spotify.login5.v3.Challenge.hashcash: object expected");
                        message.hashcash = $root.spotify.login5.v3.challenges.HashcashChallenge.fromObject(object.hashcash);
                    }
                    if (object.code != null) {
                        if (typeof object.code !== "object")
                            throw TypeError(".spotify.login5.v3.Challenge.code: object expected");
                        message.code = $root.spotify.login5.v3.challenges.CodeChallenge.fromObject(object.code);
                    }
                    return message;
                };

                /**
                 * Creates a plain object from a Challenge message. Also converts values to other types if specified.
                 * @function toObject
                 * @memberof spotify.login5.v3.Challenge
                 * @static
                 * @param {spotify.login5.v3.Challenge} message Challenge
                 * @param {$protobuf.IConversionOptions} [options] Conversion options
                 * @returns {Object.<string,*>} Plain object
                 */
                Challenge.toObject = function toObject(message, options) {
                    if (!options)
                        options = {};
                    var object = {};
                    if (options.defaults) {
                        object.hashcash = null;
                        object.code = null;
                    }
                    if (message.hashcash != null && message.hasOwnProperty("hashcash"))
                        object.hashcash = $root.spotify.login5.v3.challenges.HashcashChallenge.toObject(message.hashcash, options);
                    if (message.code != null && message.hasOwnProperty("code"))
                        object.code = $root.spotify.login5.v3.challenges.CodeChallenge.toObject(message.code, options);
                    return object;
                };

                /**
                 * Converts this Challenge to JSON.
                 * @function toJSON
                 * @memberof spotify.login5.v3.Challenge
                 * @instance
                 * @returns {Object.<string,*>} JSON object
                 */
                Challenge.prototype.toJSON = function toJSON() {
                    return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                };

                /**
                 * Gets the default type url for Challenge
                 * @function getTypeUrl
                 * @memberof spotify.login5.v3.Challenge
                 * @static
                 * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                 * @returns {string} The default type url
                 */
                Challenge.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                    if (typeUrlPrefix === undefined) {
                        typeUrlPrefix = "type.googleapis.com";
                    }
                    return typeUrlPrefix + "/spotify.login5.v3.Challenge";
                };

                return Challenge;
            })();

            v3.ChallengeSolutions = (function() {

                /**
                 * Properties of a ChallengeSolutions.
                 * @memberof spotify.login5.v3
                 * @interface IChallengeSolutions
                 * @property {Array.<spotify.login5.v3.IChallengeSolution>|null} [solutions] ChallengeSolutions solutions
                 */

                /**
                 * Constructs a new ChallengeSolutions.
                 * @memberof spotify.login5.v3
                 * @classdesc Represents a ChallengeSolutions.
                 * @implements IChallengeSolutions
                 * @constructor
                 * @param {spotify.login5.v3.IChallengeSolutions=} [properties] Properties to set
                 */
                function ChallengeSolutions(properties) {
                    this.solutions = [];
                    if (properties)
                        for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null)
                                this[keys[i]] = properties[keys[i]];
                }

                /**
                 * ChallengeSolutions solutions.
                 * @member {Array.<spotify.login5.v3.IChallengeSolution>} solutions
                 * @memberof spotify.login5.v3.ChallengeSolutions
                 * @instance
                 */
                ChallengeSolutions.prototype.solutions = $util.emptyArray;

                /**
                 * Creates a new ChallengeSolutions instance using the specified properties.
                 * @function create
                 * @memberof spotify.login5.v3.ChallengeSolutions
                 * @static
                 * @param {spotify.login5.v3.IChallengeSolutions=} [properties] Properties to set
                 * @returns {spotify.login5.v3.ChallengeSolutions} ChallengeSolutions instance
                 */
                ChallengeSolutions.create = function create(properties) {
                    return new ChallengeSolutions(properties);
                };

                /**
                 * Encodes the specified ChallengeSolutions message. Does not implicitly {@link spotify.login5.v3.ChallengeSolutions.verify|verify} messages.
                 * @function encode
                 * @memberof spotify.login5.v3.ChallengeSolutions
                 * @static
                 * @param {spotify.login5.v3.IChallengeSolutions} message ChallengeSolutions message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                ChallengeSolutions.encode = function encode(message, writer) {
                    if (!writer)
                        writer = $Writer.create();
                    if (message.solutions != null && message.solutions.length)
                        for (var i = 0; i < message.solutions.length; ++i)
                            $root.spotify.login5.v3.ChallengeSolution.encode(message.solutions[i], writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                    return writer;
                };

                /**
                 * Encodes the specified ChallengeSolutions message, length delimited. Does not implicitly {@link spotify.login5.v3.ChallengeSolutions.verify|verify} messages.
                 * @function encodeDelimited
                 * @memberof spotify.login5.v3.ChallengeSolutions
                 * @static
                 * @param {spotify.login5.v3.IChallengeSolutions} message ChallengeSolutions message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                ChallengeSolutions.encodeDelimited = function encodeDelimited(message, writer) {
                    return this.encode(message, writer).ldelim();
                };

                /**
                 * Decodes a ChallengeSolutions message from the specified reader or buffer.
                 * @function decode
                 * @memberof spotify.login5.v3.ChallengeSolutions
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @param {number} [length] Message length if known beforehand
                 * @returns {spotify.login5.v3.ChallengeSolutions} ChallengeSolutions
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                ChallengeSolutions.decode = function decode(reader, length) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.ChallengeSolutions();
                    while (reader.pos < end) {
                        var tag = reader.uint32();
                        switch (tag >>> 3) {
                        case 1: {
                                if (!(message.solutions && message.solutions.length))
                                    message.solutions = [];
                                message.solutions.push($root.spotify.login5.v3.ChallengeSolution.decode(reader, reader.uint32()));
                                break;
                            }
                        default:
                            reader.skipType(tag & 7);
                            break;
                        }
                    }
                    return message;
                };

                /**
                 * Decodes a ChallengeSolutions message from the specified reader or buffer, length delimited.
                 * @function decodeDelimited
                 * @memberof spotify.login5.v3.ChallengeSolutions
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @returns {spotify.login5.v3.ChallengeSolutions} ChallengeSolutions
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                ChallengeSolutions.decodeDelimited = function decodeDelimited(reader) {
                    if (!(reader instanceof $Reader))
                        reader = new $Reader(reader);
                    return this.decode(reader, reader.uint32());
                };

                /**
                 * Verifies a ChallengeSolutions message.
                 * @function verify
                 * @memberof spotify.login5.v3.ChallengeSolutions
                 * @static
                 * @param {Object.<string,*>} message Plain object to verify
                 * @returns {string|null} `null` if valid, otherwise the reason why it is not
                 */
                ChallengeSolutions.verify = function verify(message) {
                    if (typeof message !== "object" || message === null)
                        return "object expected";
                    if (message.solutions != null && message.hasOwnProperty("solutions")) {
                        if (!Array.isArray(message.solutions))
                            return "solutions: array expected";
                        for (var i = 0; i < message.solutions.length; ++i) {
                            var error = $root.spotify.login5.v3.ChallengeSolution.verify(message.solutions[i]);
                            if (error)
                                return "solutions." + error;
                        }
                    }
                    return null;
                };

                /**
                 * Creates a ChallengeSolutions message from a plain object. Also converts values to their respective internal types.
                 * @function fromObject
                 * @memberof spotify.login5.v3.ChallengeSolutions
                 * @static
                 * @param {Object.<string,*>} object Plain object
                 * @returns {spotify.login5.v3.ChallengeSolutions} ChallengeSolutions
                 */
                ChallengeSolutions.fromObject = function fromObject(object) {
                    if (object instanceof $root.spotify.login5.v3.ChallengeSolutions)
                        return object;
                    var message = new $root.spotify.login5.v3.ChallengeSolutions();
                    if (object.solutions) {
                        if (!Array.isArray(object.solutions))
                            throw TypeError(".spotify.login5.v3.ChallengeSolutions.solutions: array expected");
                        message.solutions = [];
                        for (var i = 0; i < object.solutions.length; ++i) {
                            if (typeof object.solutions[i] !== "object")
                                throw TypeError(".spotify.login5.v3.ChallengeSolutions.solutions: object expected");
                            message.solutions[i] = $root.spotify.login5.v3.ChallengeSolution.fromObject(object.solutions[i]);
                        }
                    }
                    return message;
                };

                /**
                 * Creates a plain object from a ChallengeSolutions message. Also converts values to other types if specified.
                 * @function toObject
                 * @memberof spotify.login5.v3.ChallengeSolutions
                 * @static
                 * @param {spotify.login5.v3.ChallengeSolutions} message ChallengeSolutions
                 * @param {$protobuf.IConversionOptions} [options] Conversion options
                 * @returns {Object.<string,*>} Plain object
                 */
                ChallengeSolutions.toObject = function toObject(message, options) {
                    if (!options)
                        options = {};
                    var object = {};
                    if (options.arrays || options.defaults)
                        object.solutions = [];
                    if (message.solutions && message.solutions.length) {
                        object.solutions = [];
                        for (var j = 0; j < message.solutions.length; ++j)
                            object.solutions[j] = $root.spotify.login5.v3.ChallengeSolution.toObject(message.solutions[j], options);
                    }
                    return object;
                };

                /**
                 * Converts this ChallengeSolutions to JSON.
                 * @function toJSON
                 * @memberof spotify.login5.v3.ChallengeSolutions
                 * @instance
                 * @returns {Object.<string,*>} JSON object
                 */
                ChallengeSolutions.prototype.toJSON = function toJSON() {
                    return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                };

                /**
                 * Gets the default type url for ChallengeSolutions
                 * @function getTypeUrl
                 * @memberof spotify.login5.v3.ChallengeSolutions
                 * @static
                 * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                 * @returns {string} The default type url
                 */
                ChallengeSolutions.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                    if (typeUrlPrefix === undefined) {
                        typeUrlPrefix = "type.googleapis.com";
                    }
                    return typeUrlPrefix + "/spotify.login5.v3.ChallengeSolutions";
                };

                return ChallengeSolutions;
            })();

            v3.ChallengeSolution = (function() {

                /**
                 * Properties of a ChallengeSolution.
                 * @memberof spotify.login5.v3
                 * @interface IChallengeSolution
                 * @property {spotify.login5.v3.challenges.IHashcashSolution|null} [hashcash] ChallengeSolution hashcash
                 * @property {spotify.login5.v3.challenges.ICodeSolution|null} [code] ChallengeSolution code
                 */

                /**
                 * Constructs a new ChallengeSolution.
                 * @memberof spotify.login5.v3
                 * @classdesc Represents a ChallengeSolution.
                 * @implements IChallengeSolution
                 * @constructor
                 * @param {spotify.login5.v3.IChallengeSolution=} [properties] Properties to set
                 */
                function ChallengeSolution(properties) {
                    if (properties)
                        for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null)
                                this[keys[i]] = properties[keys[i]];
                }

                /**
                 * ChallengeSolution hashcash.
                 * @member {spotify.login5.v3.challenges.IHashcashSolution|null|undefined} hashcash
                 * @memberof spotify.login5.v3.ChallengeSolution
                 * @instance
                 */
                ChallengeSolution.prototype.hashcash = null;

                /**
                 * ChallengeSolution code.
                 * @member {spotify.login5.v3.challenges.ICodeSolution|null|undefined} code
                 * @memberof spotify.login5.v3.ChallengeSolution
                 * @instance
                 */
                ChallengeSolution.prototype.code = null;

                /**
                 * Creates a new ChallengeSolution instance using the specified properties.
                 * @function create
                 * @memberof spotify.login5.v3.ChallengeSolution
                 * @static
                 * @param {spotify.login5.v3.IChallengeSolution=} [properties] Properties to set
                 * @returns {spotify.login5.v3.ChallengeSolution} ChallengeSolution instance
                 */
                ChallengeSolution.create = function create(properties) {
                    return new ChallengeSolution(properties);
                };

                /**
                 * Encodes the specified ChallengeSolution message. Does not implicitly {@link spotify.login5.v3.ChallengeSolution.verify|verify} messages.
                 * @function encode
                 * @memberof spotify.login5.v3.ChallengeSolution
                 * @static
                 * @param {spotify.login5.v3.IChallengeSolution} message ChallengeSolution message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                ChallengeSolution.encode = function encode(message, writer) {
                    if (!writer)
                        writer = $Writer.create();
                    if (message.hashcash != null && Object.hasOwnProperty.call(message, "hashcash"))
                        $root.spotify.login5.v3.challenges.HashcashSolution.encode(message.hashcash, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                    if (message.code != null && Object.hasOwnProperty.call(message, "code"))
                        $root.spotify.login5.v3.challenges.CodeSolution.encode(message.code, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
                    return writer;
                };

                /**
                 * Encodes the specified ChallengeSolution message, length delimited. Does not implicitly {@link spotify.login5.v3.ChallengeSolution.verify|verify} messages.
                 * @function encodeDelimited
                 * @memberof spotify.login5.v3.ChallengeSolution
                 * @static
                 * @param {spotify.login5.v3.IChallengeSolution} message ChallengeSolution message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                ChallengeSolution.encodeDelimited = function encodeDelimited(message, writer) {
                    return this.encode(message, writer).ldelim();
                };

                /**
                 * Decodes a ChallengeSolution message from the specified reader or buffer.
                 * @function decode
                 * @memberof spotify.login5.v3.ChallengeSolution
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @param {number} [length] Message length if known beforehand
                 * @returns {spotify.login5.v3.ChallengeSolution} ChallengeSolution
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                ChallengeSolution.decode = function decode(reader, length) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.ChallengeSolution();
                    while (reader.pos < end) {
                        var tag = reader.uint32();
                        switch (tag >>> 3) {
                        case 1: {
                                message.hashcash = $root.spotify.login5.v3.challenges.HashcashSolution.decode(reader, reader.uint32());
                                break;
                            }
                        case 2: {
                                message.code = $root.spotify.login5.v3.challenges.CodeSolution.decode(reader, reader.uint32());
                                break;
                            }
                        default:
                            reader.skipType(tag & 7);
                            break;
                        }
                    }
                    return message;
                };

                /**
                 * Decodes a ChallengeSolution message from the specified reader or buffer, length delimited.
                 * @function decodeDelimited
                 * @memberof spotify.login5.v3.ChallengeSolution
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @returns {spotify.login5.v3.ChallengeSolution} ChallengeSolution
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                ChallengeSolution.decodeDelimited = function decodeDelimited(reader) {
                    if (!(reader instanceof $Reader))
                        reader = new $Reader(reader);
                    return this.decode(reader, reader.uint32());
                };

                /**
                 * Verifies a ChallengeSolution message.
                 * @function verify
                 * @memberof spotify.login5.v3.ChallengeSolution
                 * @static
                 * @param {Object.<string,*>} message Plain object to verify
                 * @returns {string|null} `null` if valid, otherwise the reason why it is not
                 */
                ChallengeSolution.verify = function verify(message) {
                    if (typeof message !== "object" || message === null)
                        return "object expected";
                    if (message.hashcash != null && message.hasOwnProperty("hashcash")) {
                        var error = $root.spotify.login5.v3.challenges.HashcashSolution.verify(message.hashcash);
                        if (error)
                            return "hashcash." + error;
                    }
                    if (message.code != null && message.hasOwnProperty("code")) {
                        var error = $root.spotify.login5.v3.challenges.CodeSolution.verify(message.code);
                        if (error)
                            return "code." + error;
                    }
                    return null;
                };

                /**
                 * Creates a ChallengeSolution message from a plain object. Also converts values to their respective internal types.
                 * @function fromObject
                 * @memberof spotify.login5.v3.ChallengeSolution
                 * @static
                 * @param {Object.<string,*>} object Plain object
                 * @returns {spotify.login5.v3.ChallengeSolution} ChallengeSolution
                 */
                ChallengeSolution.fromObject = function fromObject(object) {
                    if (object instanceof $root.spotify.login5.v3.ChallengeSolution)
                        return object;
                    var message = new $root.spotify.login5.v3.ChallengeSolution();
                    if (object.hashcash != null) {
                        if (typeof object.hashcash !== "object")
                            throw TypeError(".spotify.login5.v3.ChallengeSolution.hashcash: object expected");
                        message.hashcash = $root.spotify.login5.v3.challenges.HashcashSolution.fromObject(object.hashcash);
                    }
                    if (object.code != null) {
                        if (typeof object.code !== "object")
                            throw TypeError(".spotify.login5.v3.ChallengeSolution.code: object expected");
                        message.code = $root.spotify.login5.v3.challenges.CodeSolution.fromObject(object.code);
                    }
                    return message;
                };

                /**
                 * Creates a plain object from a ChallengeSolution message. Also converts values to other types if specified.
                 * @function toObject
                 * @memberof spotify.login5.v3.ChallengeSolution
                 * @static
                 * @param {spotify.login5.v3.ChallengeSolution} message ChallengeSolution
                 * @param {$protobuf.IConversionOptions} [options] Conversion options
                 * @returns {Object.<string,*>} Plain object
                 */
                ChallengeSolution.toObject = function toObject(message, options) {
                    if (!options)
                        options = {};
                    var object = {};
                    if (options.defaults) {
                        object.hashcash = null;
                        object.code = null;
                    }
                    if (message.hashcash != null && message.hasOwnProperty("hashcash"))
                        object.hashcash = $root.spotify.login5.v3.challenges.HashcashSolution.toObject(message.hashcash, options);
                    if (message.code != null && message.hasOwnProperty("code"))
                        object.code = $root.spotify.login5.v3.challenges.CodeSolution.toObject(message.code, options);
                    return object;
                };

                /**
                 * Converts this ChallengeSolution to JSON.
                 * @function toJSON
                 * @memberof spotify.login5.v3.ChallengeSolution
                 * @instance
                 * @returns {Object.<string,*>} JSON object
                 */
                ChallengeSolution.prototype.toJSON = function toJSON() {
                    return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                };

                /**
                 * Gets the default type url for ChallengeSolution
                 * @function getTypeUrl
                 * @memberof spotify.login5.v3.ChallengeSolution
                 * @static
                 * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                 * @returns {string} The default type url
                 */
                ChallengeSolution.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                    if (typeUrlPrefix === undefined) {
                        typeUrlPrefix = "type.googleapis.com";
                    }
                    return typeUrlPrefix + "/spotify.login5.v3.ChallengeSolution";
                };

                return ChallengeSolution;
            })();

            v3.LoginRequest = (function() {

                /**
                 * Properties of a LoginRequest.
                 * @memberof spotify.login5.v3
                 * @interface ILoginRequest
                 * @property {spotify.login5.v3.IClientInfo|null} [clientInfo] LoginRequest clientInfo
                 * @property {Uint8Array|null} [loginContext] LoginRequest loginContext
                 * @property {spotify.login5.v3.IChallengeSolutions|null} [challengeSolutions] LoginRequest challengeSolutions
                 * @property {spotify.login5.v3.credentials.IStoredCredential|null} [storedCredential] LoginRequest storedCredential
                 * @property {spotify.login5.v3.credentials.IPassword|null} [password] LoginRequest password
                 * @property {spotify.login5.v3.credentials.IFacebookAccessToken|null} [facebookAccessToken] LoginRequest facebookAccessToken
                 * @property {spotify.login5.v3.identifiers.IPhoneNumber|null} [phoneNumber] LoginRequest phoneNumber
                 * @property {spotify.login5.v3.credentials.IOneTimeToken|null} [oneTimeToken] LoginRequest oneTimeToken
                 * @property {spotify.login5.v3.credentials.IParentChildCredential|null} [parentChildCredential] LoginRequest parentChildCredential
                 * @property {spotify.login5.v3.credentials.IAppleSignInCredential|null} [appleSignInCredential] LoginRequest appleSignInCredential
                 */

                /**
                 * Constructs a new LoginRequest.
                 * @memberof spotify.login5.v3
                 * @classdesc Represents a LoginRequest.
                 * @implements ILoginRequest
                 * @constructor
                 * @param {spotify.login5.v3.ILoginRequest=} [properties] Properties to set
                 */
                function LoginRequest(properties) {
                    if (properties)
                        for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null)
                                this[keys[i]] = properties[keys[i]];
                }

                /**
                 * LoginRequest clientInfo.
                 * @member {spotify.login5.v3.IClientInfo|null|undefined} clientInfo
                 * @memberof spotify.login5.v3.LoginRequest
                 * @instance
                 */
                LoginRequest.prototype.clientInfo = null;

                /**
                 * LoginRequest loginContext.
                 * @member {Uint8Array} loginContext
                 * @memberof spotify.login5.v3.LoginRequest
                 * @instance
                 */
                LoginRequest.prototype.loginContext = $util.newBuffer([]);

                /**
                 * LoginRequest challengeSolutions.
                 * @member {spotify.login5.v3.IChallengeSolutions|null|undefined} challengeSolutions
                 * @memberof spotify.login5.v3.LoginRequest
                 * @instance
                 */
                LoginRequest.prototype.challengeSolutions = null;

                /**
                 * LoginRequest storedCredential.
                 * @member {spotify.login5.v3.credentials.IStoredCredential|null|undefined} storedCredential
                 * @memberof spotify.login5.v3.LoginRequest
                 * @instance
                 */
                LoginRequest.prototype.storedCredential = null;

                /**
                 * LoginRequest password.
                 * @member {spotify.login5.v3.credentials.IPassword|null|undefined} password
                 * @memberof spotify.login5.v3.LoginRequest
                 * @instance
                 */
                LoginRequest.prototype.password = null;

                /**
                 * LoginRequest facebookAccessToken.
                 * @member {spotify.login5.v3.credentials.IFacebookAccessToken|null|undefined} facebookAccessToken
                 * @memberof spotify.login5.v3.LoginRequest
                 * @instance
                 */
                LoginRequest.prototype.facebookAccessToken = null;

                /**
                 * LoginRequest phoneNumber.
                 * @member {spotify.login5.v3.identifiers.IPhoneNumber|null|undefined} phoneNumber
                 * @memberof spotify.login5.v3.LoginRequest
                 * @instance
                 */
                LoginRequest.prototype.phoneNumber = null;

                /**
                 * LoginRequest oneTimeToken.
                 * @member {spotify.login5.v3.credentials.IOneTimeToken|null|undefined} oneTimeToken
                 * @memberof spotify.login5.v3.LoginRequest
                 * @instance
                 */
                LoginRequest.prototype.oneTimeToken = null;

                /**
                 * LoginRequest parentChildCredential.
                 * @member {spotify.login5.v3.credentials.IParentChildCredential|null|undefined} parentChildCredential
                 * @memberof spotify.login5.v3.LoginRequest
                 * @instance
                 */
                LoginRequest.prototype.parentChildCredential = null;

                /**
                 * LoginRequest appleSignInCredential.
                 * @member {spotify.login5.v3.credentials.IAppleSignInCredential|null|undefined} appleSignInCredential
                 * @memberof spotify.login5.v3.LoginRequest
                 * @instance
                 */
                LoginRequest.prototype.appleSignInCredential = null;

                /**
                 * Creates a new LoginRequest instance using the specified properties.
                 * @function create
                 * @memberof spotify.login5.v3.LoginRequest
                 * @static
                 * @param {spotify.login5.v3.ILoginRequest=} [properties] Properties to set
                 * @returns {spotify.login5.v3.LoginRequest} LoginRequest instance
                 */
                LoginRequest.create = function create(properties) {
                    return new LoginRequest(properties);
                };

                /**
                 * Encodes the specified LoginRequest message. Does not implicitly {@link spotify.login5.v3.LoginRequest.verify|verify} messages.
                 * @function encode
                 * @memberof spotify.login5.v3.LoginRequest
                 * @static
                 * @param {spotify.login5.v3.ILoginRequest} message LoginRequest message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                LoginRequest.encode = function encode(message, writer) {
                    if (!writer)
                        writer = $Writer.create();
                    if (message.clientInfo != null && Object.hasOwnProperty.call(message, "clientInfo"))
                        $root.spotify.login5.v3.ClientInfo.encode(message.clientInfo, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                    if (message.loginContext != null && Object.hasOwnProperty.call(message, "loginContext"))
                        writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.loginContext);
                    if (message.challengeSolutions != null && Object.hasOwnProperty.call(message, "challengeSolutions"))
                        $root.spotify.login5.v3.ChallengeSolutions.encode(message.challengeSolutions, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
                    if (message.storedCredential != null && Object.hasOwnProperty.call(message, "storedCredential"))
                        $root.spotify.login5.v3.credentials.StoredCredential.encode(message.storedCredential, writer.uint32(/* id 100, wireType 2 =*/802).fork()).ldelim();
                    if (message.password != null && Object.hasOwnProperty.call(message, "password"))
                        $root.spotify.login5.v3.credentials.Password.encode(message.password, writer.uint32(/* id 101, wireType 2 =*/810).fork()).ldelim();
                    if (message.facebookAccessToken != null && Object.hasOwnProperty.call(message, "facebookAccessToken"))
                        $root.spotify.login5.v3.credentials.FacebookAccessToken.encode(message.facebookAccessToken, writer.uint32(/* id 102, wireType 2 =*/818).fork()).ldelim();
                    if (message.phoneNumber != null && Object.hasOwnProperty.call(message, "phoneNumber"))
                        $root.spotify.login5.v3.identifiers.PhoneNumber.encode(message.phoneNumber, writer.uint32(/* id 103, wireType 2 =*/826).fork()).ldelim();
                    if (message.oneTimeToken != null && Object.hasOwnProperty.call(message, "oneTimeToken"))
                        $root.spotify.login5.v3.credentials.OneTimeToken.encode(message.oneTimeToken, writer.uint32(/* id 104, wireType 2 =*/834).fork()).ldelim();
                    if (message.parentChildCredential != null && Object.hasOwnProperty.call(message, "parentChildCredential"))
                        $root.spotify.login5.v3.credentials.ParentChildCredential.encode(message.parentChildCredential, writer.uint32(/* id 105, wireType 2 =*/842).fork()).ldelim();
                    if (message.appleSignInCredential != null && Object.hasOwnProperty.call(message, "appleSignInCredential"))
                        $root.spotify.login5.v3.credentials.AppleSignInCredential.encode(message.appleSignInCredential, writer.uint32(/* id 106, wireType 2 =*/850).fork()).ldelim();
                    return writer;
                };

                /**
                 * Encodes the specified LoginRequest message, length delimited. Does not implicitly {@link spotify.login5.v3.LoginRequest.verify|verify} messages.
                 * @function encodeDelimited
                 * @memberof spotify.login5.v3.LoginRequest
                 * @static
                 * @param {spotify.login5.v3.ILoginRequest} message LoginRequest message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                LoginRequest.encodeDelimited = function encodeDelimited(message, writer) {
                    return this.encode(message, writer).ldelim();
                };

                /**
                 * Decodes a LoginRequest message from the specified reader or buffer.
                 * @function decode
                 * @memberof spotify.login5.v3.LoginRequest
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @param {number} [length] Message length if known beforehand
                 * @returns {spotify.login5.v3.LoginRequest} LoginRequest
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                LoginRequest.decode = function decode(reader, length) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.LoginRequest();
                    while (reader.pos < end) {
                        var tag = reader.uint32();
                        switch (tag >>> 3) {
                        case 1: {
                                message.clientInfo = $root.spotify.login5.v3.ClientInfo.decode(reader, reader.uint32());
                                break;
                            }
                        case 2: {
                                message.loginContext = reader.bytes();
                                break;
                            }
                        case 3: {
                                message.challengeSolutions = $root.spotify.login5.v3.ChallengeSolutions.decode(reader, reader.uint32());
                                break;
                            }
                        case 100: {
                                message.storedCredential = $root.spotify.login5.v3.credentials.StoredCredential.decode(reader, reader.uint32());
                                break;
                            }
                        case 101: {
                                message.password = $root.spotify.login5.v3.credentials.Password.decode(reader, reader.uint32());
                                break;
                            }
                        case 102: {
                                message.facebookAccessToken = $root.spotify.login5.v3.credentials.FacebookAccessToken.decode(reader, reader.uint32());
                                break;
                            }
                        case 103: {
                                message.phoneNumber = $root.spotify.login5.v3.identifiers.PhoneNumber.decode(reader, reader.uint32());
                                break;
                            }
                        case 104: {
                                message.oneTimeToken = $root.spotify.login5.v3.credentials.OneTimeToken.decode(reader, reader.uint32());
                                break;
                            }
                        case 105: {
                                message.parentChildCredential = $root.spotify.login5.v3.credentials.ParentChildCredential.decode(reader, reader.uint32());
                                break;
                            }
                        case 106: {
                                message.appleSignInCredential = $root.spotify.login5.v3.credentials.AppleSignInCredential.decode(reader, reader.uint32());
                                break;
                            }
                        default:
                            reader.skipType(tag & 7);
                            break;
                        }
                    }
                    return message;
                };

                /**
                 * Decodes a LoginRequest message from the specified reader or buffer, length delimited.
                 * @function decodeDelimited
                 * @memberof spotify.login5.v3.LoginRequest
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @returns {spotify.login5.v3.LoginRequest} LoginRequest
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                LoginRequest.decodeDelimited = function decodeDelimited(reader) {
                    if (!(reader instanceof $Reader))
                        reader = new $Reader(reader);
                    return this.decode(reader, reader.uint32());
                };

                /**
                 * Verifies a LoginRequest message.
                 * @function verify
                 * @memberof spotify.login5.v3.LoginRequest
                 * @static
                 * @param {Object.<string,*>} message Plain object to verify
                 * @returns {string|null} `null` if valid, otherwise the reason why it is not
                 */
                LoginRequest.verify = function verify(message) {
                    if (typeof message !== "object" || message === null)
                        return "object expected";
                    if (message.clientInfo != null && message.hasOwnProperty("clientInfo")) {
                        var error = $root.spotify.login5.v3.ClientInfo.verify(message.clientInfo);
                        if (error)
                            return "clientInfo." + error;
                    }
                    if (message.loginContext != null && message.hasOwnProperty("loginContext"))
                        if (!(message.loginContext && typeof message.loginContext.length === "number" || $util.isString(message.loginContext)))
                            return "loginContext: buffer expected";
                    if (message.challengeSolutions != null && message.hasOwnProperty("challengeSolutions")) {
                        var error = $root.spotify.login5.v3.ChallengeSolutions.verify(message.challengeSolutions);
                        if (error)
                            return "challengeSolutions." + error;
                    }
                    if (message.storedCredential != null && message.hasOwnProperty("storedCredential")) {
                        var error = $root.spotify.login5.v3.credentials.StoredCredential.verify(message.storedCredential);
                        if (error)
                            return "storedCredential." + error;
                    }
                    if (message.password != null && message.hasOwnProperty("password")) {
                        var error = $root.spotify.login5.v3.credentials.Password.verify(message.password);
                        if (error)
                            return "password." + error;
                    }
                    if (message.facebookAccessToken != null && message.hasOwnProperty("facebookAccessToken")) {
                        var error = $root.spotify.login5.v3.credentials.FacebookAccessToken.verify(message.facebookAccessToken);
                        if (error)
                            return "facebookAccessToken." + error;
                    }
                    if (message.phoneNumber != null && message.hasOwnProperty("phoneNumber")) {
                        var error = $root.spotify.login5.v3.identifiers.PhoneNumber.verify(message.phoneNumber);
                        if (error)
                            return "phoneNumber." + error;
                    }
                    if (message.oneTimeToken != null && message.hasOwnProperty("oneTimeToken")) {
                        var error = $root.spotify.login5.v3.credentials.OneTimeToken.verify(message.oneTimeToken);
                        if (error)
                            return "oneTimeToken." + error;
                    }
                    if (message.parentChildCredential != null && message.hasOwnProperty("parentChildCredential")) {
                        var error = $root.spotify.login5.v3.credentials.ParentChildCredential.verify(message.parentChildCredential);
                        if (error)
                            return "parentChildCredential." + error;
                    }
                    if (message.appleSignInCredential != null && message.hasOwnProperty("appleSignInCredential")) {
                        var error = $root.spotify.login5.v3.credentials.AppleSignInCredential.verify(message.appleSignInCredential);
                        if (error)
                            return "appleSignInCredential." + error;
                    }
                    return null;
                };

                /**
                 * Creates a LoginRequest message from a plain object. Also converts values to their respective internal types.
                 * @function fromObject
                 * @memberof spotify.login5.v3.LoginRequest
                 * @static
                 * @param {Object.<string,*>} object Plain object
                 * @returns {spotify.login5.v3.LoginRequest} LoginRequest
                 */
                LoginRequest.fromObject = function fromObject(object) {
                    if (object instanceof $root.spotify.login5.v3.LoginRequest)
                        return object;
                    var message = new $root.spotify.login5.v3.LoginRequest();
                    if (object.clientInfo != null) {
                        if (typeof object.clientInfo !== "object")
                            throw TypeError(".spotify.login5.v3.LoginRequest.clientInfo: object expected");
                        message.clientInfo = $root.spotify.login5.v3.ClientInfo.fromObject(object.clientInfo);
                    }
                    if (object.loginContext != null)
                        if (typeof object.loginContext === "string")
                            $util.base64.decode(object.loginContext, message.loginContext = $util.newBuffer($util.base64.length(object.loginContext)), 0);
                        else if (object.loginContext.length >= 0)
                            message.loginContext = object.loginContext;
                    if (object.challengeSolutions != null) {
                        if (typeof object.challengeSolutions !== "object")
                            throw TypeError(".spotify.login5.v3.LoginRequest.challengeSolutions: object expected");
                        message.challengeSolutions = $root.spotify.login5.v3.ChallengeSolutions.fromObject(object.challengeSolutions);
                    }
                    if (object.storedCredential != null) {
                        if (typeof object.storedCredential !== "object")
                            throw TypeError(".spotify.login5.v3.LoginRequest.storedCredential: object expected");
                        message.storedCredential = $root.spotify.login5.v3.credentials.StoredCredential.fromObject(object.storedCredential);
                    }
                    if (object.password != null) {
                        if (typeof object.password !== "object")
                            throw TypeError(".spotify.login5.v3.LoginRequest.password: object expected");
                        message.password = $root.spotify.login5.v3.credentials.Password.fromObject(object.password);
                    }
                    if (object.facebookAccessToken != null) {
                        if (typeof object.facebookAccessToken !== "object")
                            throw TypeError(".spotify.login5.v3.LoginRequest.facebookAccessToken: object expected");
                        message.facebookAccessToken = $root.spotify.login5.v3.credentials.FacebookAccessToken.fromObject(object.facebookAccessToken);
                    }
                    if (object.phoneNumber != null) {
                        if (typeof object.phoneNumber !== "object")
                            throw TypeError(".spotify.login5.v3.LoginRequest.phoneNumber: object expected");
                        message.phoneNumber = $root.spotify.login5.v3.identifiers.PhoneNumber.fromObject(object.phoneNumber);
                    }
                    if (object.oneTimeToken != null) {
                        if (typeof object.oneTimeToken !== "object")
                            throw TypeError(".spotify.login5.v3.LoginRequest.oneTimeToken: object expected");
                        message.oneTimeToken = $root.spotify.login5.v3.credentials.OneTimeToken.fromObject(object.oneTimeToken);
                    }
                    if (object.parentChildCredential != null) {
                        if (typeof object.parentChildCredential !== "object")
                            throw TypeError(".spotify.login5.v3.LoginRequest.parentChildCredential: object expected");
                        message.parentChildCredential = $root.spotify.login5.v3.credentials.ParentChildCredential.fromObject(object.parentChildCredential);
                    }
                    if (object.appleSignInCredential != null) {
                        if (typeof object.appleSignInCredential !== "object")
                            throw TypeError(".spotify.login5.v3.LoginRequest.appleSignInCredential: object expected");
                        message.appleSignInCredential = $root.spotify.login5.v3.credentials.AppleSignInCredential.fromObject(object.appleSignInCredential);
                    }
                    return message;
                };

                /**
                 * Creates a plain object from a LoginRequest message. Also converts values to other types if specified.
                 * @function toObject
                 * @memberof spotify.login5.v3.LoginRequest
                 * @static
                 * @param {spotify.login5.v3.LoginRequest} message LoginRequest
                 * @param {$protobuf.IConversionOptions} [options] Conversion options
                 * @returns {Object.<string,*>} Plain object
                 */
                LoginRequest.toObject = function toObject(message, options) {
                    if (!options)
                        options = {};
                    var object = {};
                    if (options.defaults) {
                        object.clientInfo = null;
                        if (options.bytes === String)
                            object.loginContext = "";
                        else {
                            object.loginContext = [];
                            if (options.bytes !== Array)
                                object.loginContext = $util.newBuffer(object.loginContext);
                        }
                        object.challengeSolutions = null;
                        object.storedCredential = null;
                        object.password = null;
                        object.facebookAccessToken = null;
                        object.phoneNumber = null;
                        object.oneTimeToken = null;
                        object.parentChildCredential = null;
                        object.appleSignInCredential = null;
                    }
                    if (message.clientInfo != null && message.hasOwnProperty("clientInfo"))
                        object.clientInfo = $root.spotify.login5.v3.ClientInfo.toObject(message.clientInfo, options);
                    if (message.loginContext != null && message.hasOwnProperty("loginContext"))
                        object.loginContext = options.bytes === String ? $util.base64.encode(message.loginContext, 0, message.loginContext.length) : options.bytes === Array ? Array.prototype.slice.call(message.loginContext) : message.loginContext;
                    if (message.challengeSolutions != null && message.hasOwnProperty("challengeSolutions"))
                        object.challengeSolutions = $root.spotify.login5.v3.ChallengeSolutions.toObject(message.challengeSolutions, options);
                    if (message.storedCredential != null && message.hasOwnProperty("storedCredential"))
                        object.storedCredential = $root.spotify.login5.v3.credentials.StoredCredential.toObject(message.storedCredential, options);
                    if (message.password != null && message.hasOwnProperty("password"))
                        object.password = $root.spotify.login5.v3.credentials.Password.toObject(message.password, options);
                    if (message.facebookAccessToken != null && message.hasOwnProperty("facebookAccessToken"))
                        object.facebookAccessToken = $root.spotify.login5.v3.credentials.FacebookAccessToken.toObject(message.facebookAccessToken, options);
                    if (message.phoneNumber != null && message.hasOwnProperty("phoneNumber"))
                        object.phoneNumber = $root.spotify.login5.v3.identifiers.PhoneNumber.toObject(message.phoneNumber, options);
                    if (message.oneTimeToken != null && message.hasOwnProperty("oneTimeToken"))
                        object.oneTimeToken = $root.spotify.login5.v3.credentials.OneTimeToken.toObject(message.oneTimeToken, options);
                    if (message.parentChildCredential != null && message.hasOwnProperty("parentChildCredential"))
                        object.parentChildCredential = $root.spotify.login5.v3.credentials.ParentChildCredential.toObject(message.parentChildCredential, options);
                    if (message.appleSignInCredential != null && message.hasOwnProperty("appleSignInCredential"))
                        object.appleSignInCredential = $root.spotify.login5.v3.credentials.AppleSignInCredential.toObject(message.appleSignInCredential, options);
                    return object;
                };

                /**
                 * Converts this LoginRequest to JSON.
                 * @function toJSON
                 * @memberof spotify.login5.v3.LoginRequest
                 * @instance
                 * @returns {Object.<string,*>} JSON object
                 */
                LoginRequest.prototype.toJSON = function toJSON() {
                    return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                };

                /**
                 * Gets the default type url for LoginRequest
                 * @function getTypeUrl
                 * @memberof spotify.login5.v3.LoginRequest
                 * @static
                 * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                 * @returns {string} The default type url
                 */
                LoginRequest.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                    if (typeUrlPrefix === undefined) {
                        typeUrlPrefix = "type.googleapis.com";
                    }
                    return typeUrlPrefix + "/spotify.login5.v3.LoginRequest";
                };

                return LoginRequest;
            })();

            v3.LoginOk = (function() {

                /**
                 * Properties of a LoginOk.
                 * @memberof spotify.login5.v3
                 * @interface ILoginOk
                 * @property {string|null} [username] LoginOk username
                 * @property {string|null} [accessToken] LoginOk accessToken
                 * @property {Uint8Array|null} [storedCredential] LoginOk storedCredential
                 * @property {number|null} [accessTokenExpiresIn] LoginOk accessTokenExpiresIn
                 */

                /**
                 * Constructs a new LoginOk.
                 * @memberof spotify.login5.v3
                 * @classdesc Represents a LoginOk.
                 * @implements ILoginOk
                 * @constructor
                 * @param {spotify.login5.v3.ILoginOk=} [properties] Properties to set
                 */
                function LoginOk(properties) {
                    if (properties)
                        for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null)
                                this[keys[i]] = properties[keys[i]];
                }

                /**
                 * LoginOk username.
                 * @member {string} username
                 * @memberof spotify.login5.v3.LoginOk
                 * @instance
                 */
                LoginOk.prototype.username = "";

                /**
                 * LoginOk accessToken.
                 * @member {string} accessToken
                 * @memberof spotify.login5.v3.LoginOk
                 * @instance
                 */
                LoginOk.prototype.accessToken = "";

                /**
                 * LoginOk storedCredential.
                 * @member {Uint8Array} storedCredential
                 * @memberof spotify.login5.v3.LoginOk
                 * @instance
                 */
                LoginOk.prototype.storedCredential = $util.newBuffer([]);

                /**
                 * LoginOk accessTokenExpiresIn.
                 * @member {number} accessTokenExpiresIn
                 * @memberof spotify.login5.v3.LoginOk
                 * @instance
                 */
                LoginOk.prototype.accessTokenExpiresIn = 0;

                /**
                 * Creates a new LoginOk instance using the specified properties.
                 * @function create
                 * @memberof spotify.login5.v3.LoginOk
                 * @static
                 * @param {spotify.login5.v3.ILoginOk=} [properties] Properties to set
                 * @returns {spotify.login5.v3.LoginOk} LoginOk instance
                 */
                LoginOk.create = function create(properties) {
                    return new LoginOk(properties);
                };

                /**
                 * Encodes the specified LoginOk message. Does not implicitly {@link spotify.login5.v3.LoginOk.verify|verify} messages.
                 * @function encode
                 * @memberof spotify.login5.v3.LoginOk
                 * @static
                 * @param {spotify.login5.v3.ILoginOk} message LoginOk message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                LoginOk.encode = function encode(message, writer) {
                    if (!writer)
                        writer = $Writer.create();
                    if (message.username != null && Object.hasOwnProperty.call(message, "username"))
                        writer.uint32(/* id 1, wireType 2 =*/10).string(message.username);
                    if (message.accessToken != null && Object.hasOwnProperty.call(message, "accessToken"))
                        writer.uint32(/* id 2, wireType 2 =*/18).string(message.accessToken);
                    if (message.storedCredential != null && Object.hasOwnProperty.call(message, "storedCredential"))
                        writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.storedCredential);
                    if (message.accessTokenExpiresIn != null && Object.hasOwnProperty.call(message, "accessTokenExpiresIn"))
                        writer.uint32(/* id 4, wireType 0 =*/32).int32(message.accessTokenExpiresIn);
                    return writer;
                };

                /**
                 * Encodes the specified LoginOk message, length delimited. Does not implicitly {@link spotify.login5.v3.LoginOk.verify|verify} messages.
                 * @function encodeDelimited
                 * @memberof spotify.login5.v3.LoginOk
                 * @static
                 * @param {spotify.login5.v3.ILoginOk} message LoginOk message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                LoginOk.encodeDelimited = function encodeDelimited(message, writer) {
                    return this.encode(message, writer).ldelim();
                };

                /**
                 * Decodes a LoginOk message from the specified reader or buffer.
                 * @function decode
                 * @memberof spotify.login5.v3.LoginOk
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @param {number} [length] Message length if known beforehand
                 * @returns {spotify.login5.v3.LoginOk} LoginOk
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                LoginOk.decode = function decode(reader, length) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.LoginOk();
                    while (reader.pos < end) {
                        var tag = reader.uint32();
                        switch (tag >>> 3) {
                        case 1: {
                                message.username = reader.string();
                                break;
                            }
                        case 2: {
                                message.accessToken = reader.string();
                                break;
                            }
                        case 3: {
                                message.storedCredential = reader.bytes();
                                break;
                            }
                        case 4: {
                                message.accessTokenExpiresIn = reader.int32();
                                break;
                            }
                        default:
                            reader.skipType(tag & 7);
                            break;
                        }
                    }
                    return message;
                };

                /**
                 * Decodes a LoginOk message from the specified reader or buffer, length delimited.
                 * @function decodeDelimited
                 * @memberof spotify.login5.v3.LoginOk
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @returns {spotify.login5.v3.LoginOk} LoginOk
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                LoginOk.decodeDelimited = function decodeDelimited(reader) {
                    if (!(reader instanceof $Reader))
                        reader = new $Reader(reader);
                    return this.decode(reader, reader.uint32());
                };

                /**
                 * Verifies a LoginOk message.
                 * @function verify
                 * @memberof spotify.login5.v3.LoginOk
                 * @static
                 * @param {Object.<string,*>} message Plain object to verify
                 * @returns {string|null} `null` if valid, otherwise the reason why it is not
                 */
                LoginOk.verify = function verify(message) {
                    if (typeof message !== "object" || message === null)
                        return "object expected";
                    if (message.username != null && message.hasOwnProperty("username"))
                        if (!$util.isString(message.username))
                            return "username: string expected";
                    if (message.accessToken != null && message.hasOwnProperty("accessToken"))
                        if (!$util.isString(message.accessToken))
                            return "accessToken: string expected";
                    if (message.storedCredential != null && message.hasOwnProperty("storedCredential"))
                        if (!(message.storedCredential && typeof message.storedCredential.length === "number" || $util.isString(message.storedCredential)))
                            return "storedCredential: buffer expected";
                    if (message.accessTokenExpiresIn != null && message.hasOwnProperty("accessTokenExpiresIn"))
                        if (!$util.isInteger(message.accessTokenExpiresIn))
                            return "accessTokenExpiresIn: integer expected";
                    return null;
                };

                /**
                 * Creates a LoginOk message from a plain object. Also converts values to their respective internal types.
                 * @function fromObject
                 * @memberof spotify.login5.v3.LoginOk
                 * @static
                 * @param {Object.<string,*>} object Plain object
                 * @returns {spotify.login5.v3.LoginOk} LoginOk
                 */
                LoginOk.fromObject = function fromObject(object) {
                    if (object instanceof $root.spotify.login5.v3.LoginOk)
                        return object;
                    var message = new $root.spotify.login5.v3.LoginOk();
                    if (object.username != null)
                        message.username = String(object.username);
                    if (object.accessToken != null)
                        message.accessToken = String(object.accessToken);
                    if (object.storedCredential != null)
                        if (typeof object.storedCredential === "string")
                            $util.base64.decode(object.storedCredential, message.storedCredential = $util.newBuffer($util.base64.length(object.storedCredential)), 0);
                        else if (object.storedCredential.length >= 0)
                            message.storedCredential = object.storedCredential;
                    if (object.accessTokenExpiresIn != null)
                        message.accessTokenExpiresIn = object.accessTokenExpiresIn | 0;
                    return message;
                };

                /**
                 * Creates a plain object from a LoginOk message. Also converts values to other types if specified.
                 * @function toObject
                 * @memberof spotify.login5.v3.LoginOk
                 * @static
                 * @param {spotify.login5.v3.LoginOk} message LoginOk
                 * @param {$protobuf.IConversionOptions} [options] Conversion options
                 * @returns {Object.<string,*>} Plain object
                 */
                LoginOk.toObject = function toObject(message, options) {
                    if (!options)
                        options = {};
                    var object = {};
                    if (options.defaults) {
                        object.username = "";
                        object.accessToken = "";
                        if (options.bytes === String)
                            object.storedCredential = "";
                        else {
                            object.storedCredential = [];
                            if (options.bytes !== Array)
                                object.storedCredential = $util.newBuffer(object.storedCredential);
                        }
                        object.accessTokenExpiresIn = 0;
                    }
                    if (message.username != null && message.hasOwnProperty("username"))
                        object.username = message.username;
                    if (message.accessToken != null && message.hasOwnProperty("accessToken"))
                        object.accessToken = message.accessToken;
                    if (message.storedCredential != null && message.hasOwnProperty("storedCredential"))
                        object.storedCredential = options.bytes === String ? $util.base64.encode(message.storedCredential, 0, message.storedCredential.length) : options.bytes === Array ? Array.prototype.slice.call(message.storedCredential) : message.storedCredential;
                    if (message.accessTokenExpiresIn != null && message.hasOwnProperty("accessTokenExpiresIn"))
                        object.accessTokenExpiresIn = message.accessTokenExpiresIn;
                    return object;
                };

                /**
                 * Converts this LoginOk to JSON.
                 * @function toJSON
                 * @memberof spotify.login5.v3.LoginOk
                 * @instance
                 * @returns {Object.<string,*>} JSON object
                 */
                LoginOk.prototype.toJSON = function toJSON() {
                    return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                };

                /**
                 * Gets the default type url for LoginOk
                 * @function getTypeUrl
                 * @memberof spotify.login5.v3.LoginOk
                 * @static
                 * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                 * @returns {string} The default type url
                 */
                LoginOk.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                    if (typeUrlPrefix === undefined) {
                        typeUrlPrefix = "type.googleapis.com";
                    }
                    return typeUrlPrefix + "/spotify.login5.v3.LoginOk";
                };

                return LoginOk;
            })();

            v3.LoginResponse = (function() {

                /**
                 * Properties of a LoginResponse.
                 * @memberof spotify.login5.v3
                 * @interface ILoginResponse
                 * @property {spotify.login5.v3.ILoginOk|null} [ok] LoginResponse ok
                 * @property {spotify.login5.v3.LoginError|null} [error] LoginResponse error
                 * @property {spotify.login5.v3.IChallenges|null} [challenges] LoginResponse challenges
                 * @property {Array.<spotify.login5.v3.LoginResponse.Warnings>|null} [warnings] LoginResponse warnings
                 * @property {Uint8Array|null} [loginContext] LoginResponse loginContext
                 * @property {string|null} [identifierToken] LoginResponse identifierToken
                 * @property {spotify.login5.v3.IUserInfo|null} [userInfo] LoginResponse userInfo
                 */

                /**
                 * Constructs a new LoginResponse.
                 * @memberof spotify.login5.v3
                 * @classdesc Represents a LoginResponse.
                 * @implements ILoginResponse
                 * @constructor
                 * @param {spotify.login5.v3.ILoginResponse=} [properties] Properties to set
                 */
                function LoginResponse(properties) {
                    this.warnings = [];
                    if (properties)
                        for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null)
                                this[keys[i]] = properties[keys[i]];
                }

                /**
                 * LoginResponse ok.
                 * @member {spotify.login5.v3.ILoginOk|null|undefined} ok
                 * @memberof spotify.login5.v3.LoginResponse
                 * @instance
                 */
                LoginResponse.prototype.ok = null;

                /**
                 * LoginResponse error.
                 * @member {spotify.login5.v3.LoginError} error
                 * @memberof spotify.login5.v3.LoginResponse
                 * @instance
                 */
                LoginResponse.prototype.error = 0;

                /**
                 * LoginResponse challenges.
                 * @member {spotify.login5.v3.IChallenges|null|undefined} challenges
                 * @memberof spotify.login5.v3.LoginResponse
                 * @instance
                 */
                LoginResponse.prototype.challenges = null;

                /**
                 * LoginResponse warnings.
                 * @member {Array.<spotify.login5.v3.LoginResponse.Warnings>} warnings
                 * @memberof spotify.login5.v3.LoginResponse
                 * @instance
                 */
                LoginResponse.prototype.warnings = $util.emptyArray;

                /**
                 * LoginResponse loginContext.
                 * @member {Uint8Array} loginContext
                 * @memberof spotify.login5.v3.LoginResponse
                 * @instance
                 */
                LoginResponse.prototype.loginContext = $util.newBuffer([]);

                /**
                 * LoginResponse identifierToken.
                 * @member {string} identifierToken
                 * @memberof spotify.login5.v3.LoginResponse
                 * @instance
                 */
                LoginResponse.prototype.identifierToken = "";

                /**
                 * LoginResponse userInfo.
                 * @member {spotify.login5.v3.IUserInfo|null|undefined} userInfo
                 * @memberof spotify.login5.v3.LoginResponse
                 * @instance
                 */
                LoginResponse.prototype.userInfo = null;

                /**
                 * Creates a new LoginResponse instance using the specified properties.
                 * @function create
                 * @memberof spotify.login5.v3.LoginResponse
                 * @static
                 * @param {spotify.login5.v3.ILoginResponse=} [properties] Properties to set
                 * @returns {spotify.login5.v3.LoginResponse} LoginResponse instance
                 */
                LoginResponse.create = function create(properties) {
                    return new LoginResponse(properties);
                };

                /**
                 * Encodes the specified LoginResponse message. Does not implicitly {@link spotify.login5.v3.LoginResponse.verify|verify} messages.
                 * @function encode
                 * @memberof spotify.login5.v3.LoginResponse
                 * @static
                 * @param {spotify.login5.v3.ILoginResponse} message LoginResponse message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                LoginResponse.encode = function encode(message, writer) {
                    if (!writer)
                        writer = $Writer.create();
                    if (message.ok != null && Object.hasOwnProperty.call(message, "ok"))
                        $root.spotify.login5.v3.LoginOk.encode(message.ok, writer.uint32(/* id 1, wireType 2 =*/10).fork()).ldelim();
                    if (message.error != null && Object.hasOwnProperty.call(message, "error"))
                        writer.uint32(/* id 2, wireType 0 =*/16).int32(message.error);
                    if (message.challenges != null && Object.hasOwnProperty.call(message, "challenges"))
                        $root.spotify.login5.v3.Challenges.encode(message.challenges, writer.uint32(/* id 3, wireType 2 =*/26).fork()).ldelim();
                    if (message.warnings != null && message.warnings.length) {
                        writer.uint32(/* id 4, wireType 2 =*/34).fork();
                        for (var i = 0; i < message.warnings.length; ++i)
                            writer.int32(message.warnings[i]);
                        writer.ldelim();
                    }
                    if (message.loginContext != null && Object.hasOwnProperty.call(message, "loginContext"))
                        writer.uint32(/* id 5, wireType 2 =*/42).bytes(message.loginContext);
                    if (message.identifierToken != null && Object.hasOwnProperty.call(message, "identifierToken"))
                        writer.uint32(/* id 6, wireType 2 =*/50).string(message.identifierToken);
                    if (message.userInfo != null && Object.hasOwnProperty.call(message, "userInfo"))
                        $root.spotify.login5.v3.UserInfo.encode(message.userInfo, writer.uint32(/* id 7, wireType 2 =*/58).fork()).ldelim();
                    return writer;
                };

                /**
                 * Encodes the specified LoginResponse message, length delimited. Does not implicitly {@link spotify.login5.v3.LoginResponse.verify|verify} messages.
                 * @function encodeDelimited
                 * @memberof spotify.login5.v3.LoginResponse
                 * @static
                 * @param {spotify.login5.v3.ILoginResponse} message LoginResponse message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                LoginResponse.encodeDelimited = function encodeDelimited(message, writer) {
                    return this.encode(message, writer).ldelim();
                };

                /**
                 * Decodes a LoginResponse message from the specified reader or buffer.
                 * @function decode
                 * @memberof spotify.login5.v3.LoginResponse
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @param {number} [length] Message length if known beforehand
                 * @returns {spotify.login5.v3.LoginResponse} LoginResponse
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                LoginResponse.decode = function decode(reader, length) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.LoginResponse();
                    while (reader.pos < end) {
                        var tag = reader.uint32();
                        switch (tag >>> 3) {
                        case 1: {
                                message.ok = $root.spotify.login5.v3.LoginOk.decode(reader, reader.uint32());
                                break;
                            }
                        case 2: {
                                message.error = reader.int32();
                                break;
                            }
                        case 3: {
                                message.challenges = $root.spotify.login5.v3.Challenges.decode(reader, reader.uint32());
                                break;
                            }
                        case 4: {
                                if (!(message.warnings && message.warnings.length))
                                    message.warnings = [];
                                if ((tag & 7) === 2) {
                                    var end2 = reader.uint32() + reader.pos;
                                    while (reader.pos < end2)
                                        message.warnings.push(reader.int32());
                                } else
                                    message.warnings.push(reader.int32());
                                break;
                            }
                        case 5: {
                                message.loginContext = reader.bytes();
                                break;
                            }
                        case 6: {
                                message.identifierToken = reader.string();
                                break;
                            }
                        case 7: {
                                message.userInfo = $root.spotify.login5.v3.UserInfo.decode(reader, reader.uint32());
                                break;
                            }
                        default:
                            reader.skipType(tag & 7);
                            break;
                        }
                    }
                    return message;
                };

                /**
                 * Decodes a LoginResponse message from the specified reader or buffer, length delimited.
                 * @function decodeDelimited
                 * @memberof spotify.login5.v3.LoginResponse
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @returns {spotify.login5.v3.LoginResponse} LoginResponse
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                LoginResponse.decodeDelimited = function decodeDelimited(reader) {
                    if (!(reader instanceof $Reader))
                        reader = new $Reader(reader);
                    return this.decode(reader, reader.uint32());
                };

                /**
                 * Verifies a LoginResponse message.
                 * @function verify
                 * @memberof spotify.login5.v3.LoginResponse
                 * @static
                 * @param {Object.<string,*>} message Plain object to verify
                 * @returns {string|null} `null` if valid, otherwise the reason why it is not
                 */
                LoginResponse.verify = function verify(message) {
                    if (typeof message !== "object" || message === null)
                        return "object expected";
                    if (message.ok != null && message.hasOwnProperty("ok")) {
                        var error = $root.spotify.login5.v3.LoginOk.verify(message.ok);
                        if (error)
                            return "ok." + error;
                    }
                    if (message.error != null && message.hasOwnProperty("error"))
                        switch (message.error) {
                        default:
                            return "error: enum value expected";
                        case 0:
                        case 1:
                        case 2:
                        case 3:
                        case 4:
                        case 5:
                        case 6:
                        case 7:
                        case 8:
                            break;
                        }
                    if (message.challenges != null && message.hasOwnProperty("challenges")) {
                        var error = $root.spotify.login5.v3.Challenges.verify(message.challenges);
                        if (error)
                            return "challenges." + error;
                    }
                    if (message.warnings != null && message.hasOwnProperty("warnings")) {
                        if (!Array.isArray(message.warnings))
                            return "warnings: array expected";
                        for (var i = 0; i < message.warnings.length; ++i)
                            switch (message.warnings[i]) {
                            default:
                                return "warnings: enum value[] expected";
                            case 0:
                            case 1:
                                break;
                            }
                    }
                    if (message.loginContext != null && message.hasOwnProperty("loginContext"))
                        if (!(message.loginContext && typeof message.loginContext.length === "number" || $util.isString(message.loginContext)))
                            return "loginContext: buffer expected";
                    if (message.identifierToken != null && message.hasOwnProperty("identifierToken"))
                        if (!$util.isString(message.identifierToken))
                            return "identifierToken: string expected";
                    if (message.userInfo != null && message.hasOwnProperty("userInfo")) {
                        var error = $root.spotify.login5.v3.UserInfo.verify(message.userInfo);
                        if (error)
                            return "userInfo." + error;
                    }
                    return null;
                };

                /**
                 * Creates a LoginResponse message from a plain object. Also converts values to their respective internal types.
                 * @function fromObject
                 * @memberof spotify.login5.v3.LoginResponse
                 * @static
                 * @param {Object.<string,*>} object Plain object
                 * @returns {spotify.login5.v3.LoginResponse} LoginResponse
                 */
                LoginResponse.fromObject = function fromObject(object) {
                    if (object instanceof $root.spotify.login5.v3.LoginResponse)
                        return object;
                    var message = new $root.spotify.login5.v3.LoginResponse();
                    if (object.ok != null) {
                        if (typeof object.ok !== "object")
                            throw TypeError(".spotify.login5.v3.LoginResponse.ok: object expected");
                        message.ok = $root.spotify.login5.v3.LoginOk.fromObject(object.ok);
                    }
                    switch (object.error) {
                    default:
                        if (typeof object.error === "number") {
                            message.error = object.error;
                            break;
                        }
                        break;
                    case "UNKNOWN_ERROR":
                    case 0:
                        message.error = 0;
                        break;
                    case "INVALID_CREDENTIALS":
                    case 1:
                        message.error = 1;
                        break;
                    case "BAD_REQUEST":
                    case 2:
                        message.error = 2;
                        break;
                    case "UNSUPPORTED_LOGIN_PROTOCOL":
                    case 3:
                        message.error = 3;
                        break;
                    case "TIMEOUT":
                    case 4:
                        message.error = 4;
                        break;
                    case "UNKNOWN_IDENTIFIER":
                    case 5:
                        message.error = 5;
                        break;
                    case "TOO_MANY_ATTEMPTS":
                    case 6:
                        message.error = 6;
                        break;
                    case "INVALID_PHONENUMBER":
                    case 7:
                        message.error = 7;
                        break;
                    case "TRY_AGAIN_LATER":
                    case 8:
                        message.error = 8;
                        break;
                    }
                    if (object.challenges != null) {
                        if (typeof object.challenges !== "object")
                            throw TypeError(".spotify.login5.v3.LoginResponse.challenges: object expected");
                        message.challenges = $root.spotify.login5.v3.Challenges.fromObject(object.challenges);
                    }
                    if (object.warnings) {
                        if (!Array.isArray(object.warnings))
                            throw TypeError(".spotify.login5.v3.LoginResponse.warnings: array expected");
                        message.warnings = [];
                        for (var i = 0; i < object.warnings.length; ++i)
                            switch (object.warnings[i]) {
                            default:
                                if (typeof object.warnings[i] === "number") {
                                    message.warnings[i] = object.warnings[i];
                                    break;
                                }
                            case "UNKNOWN_WARNING":
                            case 0:
                                message.warnings[i] = 0;
                                break;
                            case "DEPRECATED_PROTOCOL_VERSION":
                            case 1:
                                message.warnings[i] = 1;
                                break;
                            }
                    }
                    if (object.loginContext != null)
                        if (typeof object.loginContext === "string")
                            $util.base64.decode(object.loginContext, message.loginContext = $util.newBuffer($util.base64.length(object.loginContext)), 0);
                        else if (object.loginContext.length >= 0)
                            message.loginContext = object.loginContext;
                    if (object.identifierToken != null)
                        message.identifierToken = String(object.identifierToken);
                    if (object.userInfo != null) {
                        if (typeof object.userInfo !== "object")
                            throw TypeError(".spotify.login5.v3.LoginResponse.userInfo: object expected");
                        message.userInfo = $root.spotify.login5.v3.UserInfo.fromObject(object.userInfo);
                    }
                    return message;
                };

                /**
                 * Creates a plain object from a LoginResponse message. Also converts values to other types if specified.
                 * @function toObject
                 * @memberof spotify.login5.v3.LoginResponse
                 * @static
                 * @param {spotify.login5.v3.LoginResponse} message LoginResponse
                 * @param {$protobuf.IConversionOptions} [options] Conversion options
                 * @returns {Object.<string,*>} Plain object
                 */
                LoginResponse.toObject = function toObject(message, options) {
                    if (!options)
                        options = {};
                    var object = {};
                    if (options.arrays || options.defaults)
                        object.warnings = [];
                    if (options.defaults) {
                        object.ok = null;
                        object.error = options.enums === String ? "UNKNOWN_ERROR" : 0;
                        object.challenges = null;
                        if (options.bytes === String)
                            object.loginContext = "";
                        else {
                            object.loginContext = [];
                            if (options.bytes !== Array)
                                object.loginContext = $util.newBuffer(object.loginContext);
                        }
                        object.identifierToken = "";
                        object.userInfo = null;
                    }
                    if (message.ok != null && message.hasOwnProperty("ok"))
                        object.ok = $root.spotify.login5.v3.LoginOk.toObject(message.ok, options);
                    if (message.error != null && message.hasOwnProperty("error"))
                        object.error = options.enums === String ? $root.spotify.login5.v3.LoginError[message.error] === undefined ? message.error : $root.spotify.login5.v3.LoginError[message.error] : message.error;
                    if (message.challenges != null && message.hasOwnProperty("challenges"))
                        object.challenges = $root.spotify.login5.v3.Challenges.toObject(message.challenges, options);
                    if (message.warnings && message.warnings.length) {
                        object.warnings = [];
                        for (var j = 0; j < message.warnings.length; ++j)
                            object.warnings[j] = options.enums === String ? $root.spotify.login5.v3.LoginResponse.Warnings[message.warnings[j]] === undefined ? message.warnings[j] : $root.spotify.login5.v3.LoginResponse.Warnings[message.warnings[j]] : message.warnings[j];
                    }
                    if (message.loginContext != null && message.hasOwnProperty("loginContext"))
                        object.loginContext = options.bytes === String ? $util.base64.encode(message.loginContext, 0, message.loginContext.length) : options.bytes === Array ? Array.prototype.slice.call(message.loginContext) : message.loginContext;
                    if (message.identifierToken != null && message.hasOwnProperty("identifierToken"))
                        object.identifierToken = message.identifierToken;
                    if (message.userInfo != null && message.hasOwnProperty("userInfo"))
                        object.userInfo = $root.spotify.login5.v3.UserInfo.toObject(message.userInfo, options);
                    return object;
                };

                /**
                 * Converts this LoginResponse to JSON.
                 * @function toJSON
                 * @memberof spotify.login5.v3.LoginResponse
                 * @instance
                 * @returns {Object.<string,*>} JSON object
                 */
                LoginResponse.prototype.toJSON = function toJSON() {
                    return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                };

                /**
                 * Gets the default type url for LoginResponse
                 * @function getTypeUrl
                 * @memberof spotify.login5.v3.LoginResponse
                 * @static
                 * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                 * @returns {string} The default type url
                 */
                LoginResponse.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                    if (typeUrlPrefix === undefined) {
                        typeUrlPrefix = "type.googleapis.com";
                    }
                    return typeUrlPrefix + "/spotify.login5.v3.LoginResponse";
                };

                /**
                 * Warnings enum.
                 * @name spotify.login5.v3.LoginResponse.Warnings
                 * @enum {number}
                 * @property {number} UNKNOWN_WARNING=0 UNKNOWN_WARNING value
                 * @property {number} DEPRECATED_PROTOCOL_VERSION=1 DEPRECATED_PROTOCOL_VERSION value
                 */
                LoginResponse.Warnings = (function() {
                    var valuesById = {}, values = Object.create(valuesById);
                    values[valuesById[0] = "UNKNOWN_WARNING"] = 0;
                    values[valuesById[1] = "DEPRECATED_PROTOCOL_VERSION"] = 1;
                    return values;
                })();

                return LoginResponse;
            })();

            v3.ClientInfo = (function() {

                /**
                 * Properties of a ClientInfo.
                 * @memberof spotify.login5.v3
                 * @interface IClientInfo
                 * @property {string|null} [clientId] ClientInfo clientId
                 * @property {string|null} [deviceId] ClientInfo deviceId
                 */

                /**
                 * Constructs a new ClientInfo.
                 * @memberof spotify.login5.v3
                 * @classdesc Represents a ClientInfo.
                 * @implements IClientInfo
                 * @constructor
                 * @param {spotify.login5.v3.IClientInfo=} [properties] Properties to set
                 */
                function ClientInfo(properties) {
                    if (properties)
                        for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null)
                                this[keys[i]] = properties[keys[i]];
                }

                /**
                 * ClientInfo clientId.
                 * @member {string} clientId
                 * @memberof spotify.login5.v3.ClientInfo
                 * @instance
                 */
                ClientInfo.prototype.clientId = "";

                /**
                 * ClientInfo deviceId.
                 * @member {string} deviceId
                 * @memberof spotify.login5.v3.ClientInfo
                 * @instance
                 */
                ClientInfo.prototype.deviceId = "";

                /**
                 * Creates a new ClientInfo instance using the specified properties.
                 * @function create
                 * @memberof spotify.login5.v3.ClientInfo
                 * @static
                 * @param {spotify.login5.v3.IClientInfo=} [properties] Properties to set
                 * @returns {spotify.login5.v3.ClientInfo} ClientInfo instance
                 */
                ClientInfo.create = function create(properties) {
                    return new ClientInfo(properties);
                };

                /**
                 * Encodes the specified ClientInfo message. Does not implicitly {@link spotify.login5.v3.ClientInfo.verify|verify} messages.
                 * @function encode
                 * @memberof spotify.login5.v3.ClientInfo
                 * @static
                 * @param {spotify.login5.v3.IClientInfo} message ClientInfo message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                ClientInfo.encode = function encode(message, writer) {
                    if (!writer)
                        writer = $Writer.create();
                    if (message.clientId != null && Object.hasOwnProperty.call(message, "clientId"))
                        writer.uint32(/* id 1, wireType 2 =*/10).string(message.clientId);
                    if (message.deviceId != null && Object.hasOwnProperty.call(message, "deviceId"))
                        writer.uint32(/* id 2, wireType 2 =*/18).string(message.deviceId);
                    return writer;
                };

                /**
                 * Encodes the specified ClientInfo message, length delimited. Does not implicitly {@link spotify.login5.v3.ClientInfo.verify|verify} messages.
                 * @function encodeDelimited
                 * @memberof spotify.login5.v3.ClientInfo
                 * @static
                 * @param {spotify.login5.v3.IClientInfo} message ClientInfo message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                ClientInfo.encodeDelimited = function encodeDelimited(message, writer) {
                    return this.encode(message, writer).ldelim();
                };

                /**
                 * Decodes a ClientInfo message from the specified reader or buffer.
                 * @function decode
                 * @memberof spotify.login5.v3.ClientInfo
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @param {number} [length] Message length if known beforehand
                 * @returns {spotify.login5.v3.ClientInfo} ClientInfo
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                ClientInfo.decode = function decode(reader, length) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.ClientInfo();
                    while (reader.pos < end) {
                        var tag = reader.uint32();
                        switch (tag >>> 3) {
                        case 1: {
                                message.clientId = reader.string();
                                break;
                            }
                        case 2: {
                                message.deviceId = reader.string();
                                break;
                            }
                        default:
                            reader.skipType(tag & 7);
                            break;
                        }
                    }
                    return message;
                };

                /**
                 * Decodes a ClientInfo message from the specified reader or buffer, length delimited.
                 * @function decodeDelimited
                 * @memberof spotify.login5.v3.ClientInfo
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @returns {spotify.login5.v3.ClientInfo} ClientInfo
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                ClientInfo.decodeDelimited = function decodeDelimited(reader) {
                    if (!(reader instanceof $Reader))
                        reader = new $Reader(reader);
                    return this.decode(reader, reader.uint32());
                };

                /**
                 * Verifies a ClientInfo message.
                 * @function verify
                 * @memberof spotify.login5.v3.ClientInfo
                 * @static
                 * @param {Object.<string,*>} message Plain object to verify
                 * @returns {string|null} `null` if valid, otherwise the reason why it is not
                 */
                ClientInfo.verify = function verify(message) {
                    if (typeof message !== "object" || message === null)
                        return "object expected";
                    if (message.clientId != null && message.hasOwnProperty("clientId"))
                        if (!$util.isString(message.clientId))
                            return "clientId: string expected";
                    if (message.deviceId != null && message.hasOwnProperty("deviceId"))
                        if (!$util.isString(message.deviceId))
                            return "deviceId: string expected";
                    return null;
                };

                /**
                 * Creates a ClientInfo message from a plain object. Also converts values to their respective internal types.
                 * @function fromObject
                 * @memberof spotify.login5.v3.ClientInfo
                 * @static
                 * @param {Object.<string,*>} object Plain object
                 * @returns {spotify.login5.v3.ClientInfo} ClientInfo
                 */
                ClientInfo.fromObject = function fromObject(object) {
                    if (object instanceof $root.spotify.login5.v3.ClientInfo)
                        return object;
                    var message = new $root.spotify.login5.v3.ClientInfo();
                    if (object.clientId != null)
                        message.clientId = String(object.clientId);
                    if (object.deviceId != null)
                        message.deviceId = String(object.deviceId);
                    return message;
                };

                /**
                 * Creates a plain object from a ClientInfo message. Also converts values to other types if specified.
                 * @function toObject
                 * @memberof spotify.login5.v3.ClientInfo
                 * @static
                 * @param {spotify.login5.v3.ClientInfo} message ClientInfo
                 * @param {$protobuf.IConversionOptions} [options] Conversion options
                 * @returns {Object.<string,*>} Plain object
                 */
                ClientInfo.toObject = function toObject(message, options) {
                    if (!options)
                        options = {};
                    var object = {};
                    if (options.defaults) {
                        object.clientId = "";
                        object.deviceId = "";
                    }
                    if (message.clientId != null && message.hasOwnProperty("clientId"))
                        object.clientId = message.clientId;
                    if (message.deviceId != null && message.hasOwnProperty("deviceId"))
                        object.deviceId = message.deviceId;
                    return object;
                };

                /**
                 * Converts this ClientInfo to JSON.
                 * @function toJSON
                 * @memberof spotify.login5.v3.ClientInfo
                 * @instance
                 * @returns {Object.<string,*>} JSON object
                 */
                ClientInfo.prototype.toJSON = function toJSON() {
                    return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                };

                /**
                 * Gets the default type url for ClientInfo
                 * @function getTypeUrl
                 * @memberof spotify.login5.v3.ClientInfo
                 * @static
                 * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                 * @returns {string} The default type url
                 */
                ClientInfo.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                    if (typeUrlPrefix === undefined) {
                        typeUrlPrefix = "type.googleapis.com";
                    }
                    return typeUrlPrefix + "/spotify.login5.v3.ClientInfo";
                };

                return ClientInfo;
            })();

            v3.UserInfo = (function() {

                /**
                 * Properties of a UserInfo.
                 * @memberof spotify.login5.v3
                 * @interface IUserInfo
                 * @property {string|null} [name] UserInfo name
                 * @property {string|null} [email] UserInfo email
                 * @property {boolean|null} [emailVerified] UserInfo emailVerified
                 * @property {string|null} [birthdate] UserInfo birthdate
                 * @property {spotify.login5.v3.UserInfo.Gender|null} [gender] UserInfo gender
                 * @property {string|null} [phoneNumber] UserInfo phoneNumber
                 * @property {boolean|null} [phoneNumberVerified] UserInfo phoneNumberVerified
                 * @property {boolean|null} [emailAlreadyRegistered] UserInfo emailAlreadyRegistered
                 */

                /**
                 * Constructs a new UserInfo.
                 * @memberof spotify.login5.v3
                 * @classdesc Represents a UserInfo.
                 * @implements IUserInfo
                 * @constructor
                 * @param {spotify.login5.v3.IUserInfo=} [properties] Properties to set
                 */
                function UserInfo(properties) {
                    if (properties)
                        for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                            if (properties[keys[i]] != null)
                                this[keys[i]] = properties[keys[i]];
                }

                /**
                 * UserInfo name.
                 * @member {string} name
                 * @memberof spotify.login5.v3.UserInfo
                 * @instance
                 */
                UserInfo.prototype.name = "";

                /**
                 * UserInfo email.
                 * @member {string} email
                 * @memberof spotify.login5.v3.UserInfo
                 * @instance
                 */
                UserInfo.prototype.email = "";

                /**
                 * UserInfo emailVerified.
                 * @member {boolean} emailVerified
                 * @memberof spotify.login5.v3.UserInfo
                 * @instance
                 */
                UserInfo.prototype.emailVerified = false;

                /**
                 * UserInfo birthdate.
                 * @member {string} birthdate
                 * @memberof spotify.login5.v3.UserInfo
                 * @instance
                 */
                UserInfo.prototype.birthdate = "";

                /**
                 * UserInfo gender.
                 * @member {spotify.login5.v3.UserInfo.Gender} gender
                 * @memberof spotify.login5.v3.UserInfo
                 * @instance
                 */
                UserInfo.prototype.gender = 0;

                /**
                 * UserInfo phoneNumber.
                 * @member {string} phoneNumber
                 * @memberof spotify.login5.v3.UserInfo
                 * @instance
                 */
                UserInfo.prototype.phoneNumber = "";

                /**
                 * UserInfo phoneNumberVerified.
                 * @member {boolean} phoneNumberVerified
                 * @memberof spotify.login5.v3.UserInfo
                 * @instance
                 */
                UserInfo.prototype.phoneNumberVerified = false;

                /**
                 * UserInfo emailAlreadyRegistered.
                 * @member {boolean} emailAlreadyRegistered
                 * @memberof spotify.login5.v3.UserInfo
                 * @instance
                 */
                UserInfo.prototype.emailAlreadyRegistered = false;

                /**
                 * Creates a new UserInfo instance using the specified properties.
                 * @function create
                 * @memberof spotify.login5.v3.UserInfo
                 * @static
                 * @param {spotify.login5.v3.IUserInfo=} [properties] Properties to set
                 * @returns {spotify.login5.v3.UserInfo} UserInfo instance
                 */
                UserInfo.create = function create(properties) {
                    return new UserInfo(properties);
                };

                /**
                 * Encodes the specified UserInfo message. Does not implicitly {@link spotify.login5.v3.UserInfo.verify|verify} messages.
                 * @function encode
                 * @memberof spotify.login5.v3.UserInfo
                 * @static
                 * @param {spotify.login5.v3.IUserInfo} message UserInfo message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                UserInfo.encode = function encode(message, writer) {
                    if (!writer)
                        writer = $Writer.create();
                    if (message.name != null && Object.hasOwnProperty.call(message, "name"))
                        writer.uint32(/* id 1, wireType 2 =*/10).string(message.name);
                    if (message.email != null && Object.hasOwnProperty.call(message, "email"))
                        writer.uint32(/* id 2, wireType 2 =*/18).string(message.email);
                    if (message.emailVerified != null && Object.hasOwnProperty.call(message, "emailVerified"))
                        writer.uint32(/* id 3, wireType 0 =*/24).bool(message.emailVerified);
                    if (message.birthdate != null && Object.hasOwnProperty.call(message, "birthdate"))
                        writer.uint32(/* id 4, wireType 2 =*/34).string(message.birthdate);
                    if (message.gender != null && Object.hasOwnProperty.call(message, "gender"))
                        writer.uint32(/* id 5, wireType 0 =*/40).int32(message.gender);
                    if (message.phoneNumber != null && Object.hasOwnProperty.call(message, "phoneNumber"))
                        writer.uint32(/* id 6, wireType 2 =*/50).string(message.phoneNumber);
                    if (message.phoneNumberVerified != null && Object.hasOwnProperty.call(message, "phoneNumberVerified"))
                        writer.uint32(/* id 7, wireType 0 =*/56).bool(message.phoneNumberVerified);
                    if (message.emailAlreadyRegistered != null && Object.hasOwnProperty.call(message, "emailAlreadyRegistered"))
                        writer.uint32(/* id 8, wireType 0 =*/64).bool(message.emailAlreadyRegistered);
                    return writer;
                };

                /**
                 * Encodes the specified UserInfo message, length delimited. Does not implicitly {@link spotify.login5.v3.UserInfo.verify|verify} messages.
                 * @function encodeDelimited
                 * @memberof spotify.login5.v3.UserInfo
                 * @static
                 * @param {spotify.login5.v3.IUserInfo} message UserInfo message or plain object to encode
                 * @param {$protobuf.Writer} [writer] Writer to encode to
                 * @returns {$protobuf.Writer} Writer
                 */
                UserInfo.encodeDelimited = function encodeDelimited(message, writer) {
                    return this.encode(message, writer).ldelim();
                };

                /**
                 * Decodes a UserInfo message from the specified reader or buffer.
                 * @function decode
                 * @memberof spotify.login5.v3.UserInfo
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @param {number} [length] Message length if known beforehand
                 * @returns {spotify.login5.v3.UserInfo} UserInfo
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                UserInfo.decode = function decode(reader, length) {
                    if (!(reader instanceof $Reader))
                        reader = $Reader.create(reader);
                    var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.UserInfo();
                    while (reader.pos < end) {
                        var tag = reader.uint32();
                        switch (tag >>> 3) {
                        case 1: {
                                message.name = reader.string();
                                break;
                            }
                        case 2: {
                                message.email = reader.string();
                                break;
                            }
                        case 3: {
                                message.emailVerified = reader.bool();
                                break;
                            }
                        case 4: {
                                message.birthdate = reader.string();
                                break;
                            }
                        case 5: {
                                message.gender = reader.int32();
                                break;
                            }
                        case 6: {
                                message.phoneNumber = reader.string();
                                break;
                            }
                        case 7: {
                                message.phoneNumberVerified = reader.bool();
                                break;
                            }
                        case 8: {
                                message.emailAlreadyRegistered = reader.bool();
                                break;
                            }
                        default:
                            reader.skipType(tag & 7);
                            break;
                        }
                    }
                    return message;
                };

                /**
                 * Decodes a UserInfo message from the specified reader or buffer, length delimited.
                 * @function decodeDelimited
                 * @memberof spotify.login5.v3.UserInfo
                 * @static
                 * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                 * @returns {spotify.login5.v3.UserInfo} UserInfo
                 * @throws {Error} If the payload is not a reader or valid buffer
                 * @throws {$protobuf.util.ProtocolError} If required fields are missing
                 */
                UserInfo.decodeDelimited = function decodeDelimited(reader) {
                    if (!(reader instanceof $Reader))
                        reader = new $Reader(reader);
                    return this.decode(reader, reader.uint32());
                };

                /**
                 * Verifies a UserInfo message.
                 * @function verify
                 * @memberof spotify.login5.v3.UserInfo
                 * @static
                 * @param {Object.<string,*>} message Plain object to verify
                 * @returns {string|null} `null` if valid, otherwise the reason why it is not
                 */
                UserInfo.verify = function verify(message) {
                    if (typeof message !== "object" || message === null)
                        return "object expected";
                    if (message.name != null && message.hasOwnProperty("name"))
                        if (!$util.isString(message.name))
                            return "name: string expected";
                    if (message.email != null && message.hasOwnProperty("email"))
                        if (!$util.isString(message.email))
                            return "email: string expected";
                    if (message.emailVerified != null && message.hasOwnProperty("emailVerified"))
                        if (typeof message.emailVerified !== "boolean")
                            return "emailVerified: boolean expected";
                    if (message.birthdate != null && message.hasOwnProperty("birthdate"))
                        if (!$util.isString(message.birthdate))
                            return "birthdate: string expected";
                    if (message.gender != null && message.hasOwnProperty("gender"))
                        switch (message.gender) {
                        default:
                            return "gender: enum value expected";
                        case 0:
                        case 1:
                        case 2:
                        case 3:
                            break;
                        }
                    if (message.phoneNumber != null && message.hasOwnProperty("phoneNumber"))
                        if (!$util.isString(message.phoneNumber))
                            return "phoneNumber: string expected";
                    if (message.phoneNumberVerified != null && message.hasOwnProperty("phoneNumberVerified"))
                        if (typeof message.phoneNumberVerified !== "boolean")
                            return "phoneNumberVerified: boolean expected";
                    if (message.emailAlreadyRegistered != null && message.hasOwnProperty("emailAlreadyRegistered"))
                        if (typeof message.emailAlreadyRegistered !== "boolean")
                            return "emailAlreadyRegistered: boolean expected";
                    return null;
                };

                /**
                 * Creates a UserInfo message from a plain object. Also converts values to their respective internal types.
                 * @function fromObject
                 * @memberof spotify.login5.v3.UserInfo
                 * @static
                 * @param {Object.<string,*>} object Plain object
                 * @returns {spotify.login5.v3.UserInfo} UserInfo
                 */
                UserInfo.fromObject = function fromObject(object) {
                    if (object instanceof $root.spotify.login5.v3.UserInfo)
                        return object;
                    var message = new $root.spotify.login5.v3.UserInfo();
                    if (object.name != null)
                        message.name = String(object.name);
                    if (object.email != null)
                        message.email = String(object.email);
                    if (object.emailVerified != null)
                        message.emailVerified = Boolean(object.emailVerified);
                    if (object.birthdate != null)
                        message.birthdate = String(object.birthdate);
                    switch (object.gender) {
                    default:
                        if (typeof object.gender === "number") {
                            message.gender = object.gender;
                            break;
                        }
                        break;
                    case "UNKNOWN":
                    case 0:
                        message.gender = 0;
                        break;
                    case "MALE":
                    case 1:
                        message.gender = 1;
                        break;
                    case "FEMALE":
                    case 2:
                        message.gender = 2;
                        break;
                    case "NEUTRAL":
                    case 3:
                        message.gender = 3;
                        break;
                    }
                    if (object.phoneNumber != null)
                        message.phoneNumber = String(object.phoneNumber);
                    if (object.phoneNumberVerified != null)
                        message.phoneNumberVerified = Boolean(object.phoneNumberVerified);
                    if (object.emailAlreadyRegistered != null)
                        message.emailAlreadyRegistered = Boolean(object.emailAlreadyRegistered);
                    return message;
                };

                /**
                 * Creates a plain object from a UserInfo message. Also converts values to other types if specified.
                 * @function toObject
                 * @memberof spotify.login5.v3.UserInfo
                 * @static
                 * @param {spotify.login5.v3.UserInfo} message UserInfo
                 * @param {$protobuf.IConversionOptions} [options] Conversion options
                 * @returns {Object.<string,*>} Plain object
                 */
                UserInfo.toObject = function toObject(message, options) {
                    if (!options)
                        options = {};
                    var object = {};
                    if (options.defaults) {
                        object.name = "";
                        object.email = "";
                        object.emailVerified = false;
                        object.birthdate = "";
                        object.gender = options.enums === String ? "UNKNOWN" : 0;
                        object.phoneNumber = "";
                        object.phoneNumberVerified = false;
                        object.emailAlreadyRegistered = false;
                    }
                    if (message.name != null && message.hasOwnProperty("name"))
                        object.name = message.name;
                    if (message.email != null && message.hasOwnProperty("email"))
                        object.email = message.email;
                    if (message.emailVerified != null && message.hasOwnProperty("emailVerified"))
                        object.emailVerified = message.emailVerified;
                    if (message.birthdate != null && message.hasOwnProperty("birthdate"))
                        object.birthdate = message.birthdate;
                    if (message.gender != null && message.hasOwnProperty("gender"))
                        object.gender = options.enums === String ? $root.spotify.login5.v3.UserInfo.Gender[message.gender] === undefined ? message.gender : $root.spotify.login5.v3.UserInfo.Gender[message.gender] : message.gender;
                    if (message.phoneNumber != null && message.hasOwnProperty("phoneNumber"))
                        object.phoneNumber = message.phoneNumber;
                    if (message.phoneNumberVerified != null && message.hasOwnProperty("phoneNumberVerified"))
                        object.phoneNumberVerified = message.phoneNumberVerified;
                    if (message.emailAlreadyRegistered != null && message.hasOwnProperty("emailAlreadyRegistered"))
                        object.emailAlreadyRegistered = message.emailAlreadyRegistered;
                    return object;
                };

                /**
                 * Converts this UserInfo to JSON.
                 * @function toJSON
                 * @memberof spotify.login5.v3.UserInfo
                 * @instance
                 * @returns {Object.<string,*>} JSON object
                 */
                UserInfo.prototype.toJSON = function toJSON() {
                    return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                };

                /**
                 * Gets the default type url for UserInfo
                 * @function getTypeUrl
                 * @memberof spotify.login5.v3.UserInfo
                 * @static
                 * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                 * @returns {string} The default type url
                 */
                UserInfo.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                    if (typeUrlPrefix === undefined) {
                        typeUrlPrefix = "type.googleapis.com";
                    }
                    return typeUrlPrefix + "/spotify.login5.v3.UserInfo";
                };

                /**
                 * Gender enum.
                 * @name spotify.login5.v3.UserInfo.Gender
                 * @enum {number}
                 * @property {number} UNKNOWN=0 UNKNOWN value
                 * @property {number} MALE=1 MALE value
                 * @property {number} FEMALE=2 FEMALE value
                 * @property {number} NEUTRAL=3 NEUTRAL value
                 */
                UserInfo.Gender = (function() {
                    var valuesById = {}, values = Object.create(valuesById);
                    values[valuesById[0] = "UNKNOWN"] = 0;
                    values[valuesById[1] = "MALE"] = 1;
                    values[valuesById[2] = "FEMALE"] = 2;
                    values[valuesById[3] = "NEUTRAL"] = 3;
                    return values;
                })();

                return UserInfo;
            })();

            v3.challenges = (function() {

                /**
                 * Namespace challenges.
                 * @memberof spotify.login5.v3
                 * @namespace
                 */
                var challenges = {};

                challenges.CodeChallenge = (function() {

                    /**
                     * Properties of a CodeChallenge.
                     * @memberof spotify.login5.v3.challenges
                     * @interface ICodeChallenge
                     * @property {spotify.login5.v3.challenges.CodeChallenge.Method|null} [method] CodeChallenge method
                     * @property {number|null} [codeLength] CodeChallenge codeLength
                     * @property {number|null} [expiresIn] CodeChallenge expiresIn
                     * @property {string|null} [canonicalPhoneNumber] CodeChallenge canonicalPhoneNumber
                     */

                    /**
                     * Constructs a new CodeChallenge.
                     * @memberof spotify.login5.v3.challenges
                     * @classdesc Represents a CodeChallenge.
                     * @implements ICodeChallenge
                     * @constructor
                     * @param {spotify.login5.v3.challenges.ICodeChallenge=} [properties] Properties to set
                     */
                    function CodeChallenge(properties) {
                        if (properties)
                            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null)
                                    this[keys[i]] = properties[keys[i]];
                    }

                    /**
                     * CodeChallenge method.
                     * @member {spotify.login5.v3.challenges.CodeChallenge.Method} method
                     * @memberof spotify.login5.v3.challenges.CodeChallenge
                     * @instance
                     */
                    CodeChallenge.prototype.method = 0;

                    /**
                     * CodeChallenge codeLength.
                     * @member {number} codeLength
                     * @memberof spotify.login5.v3.challenges.CodeChallenge
                     * @instance
                     */
                    CodeChallenge.prototype.codeLength = 0;

                    /**
                     * CodeChallenge expiresIn.
                     * @member {number} expiresIn
                     * @memberof spotify.login5.v3.challenges.CodeChallenge
                     * @instance
                     */
                    CodeChallenge.prototype.expiresIn = 0;

                    /**
                     * CodeChallenge canonicalPhoneNumber.
                     * @member {string} canonicalPhoneNumber
                     * @memberof spotify.login5.v3.challenges.CodeChallenge
                     * @instance
                     */
                    CodeChallenge.prototype.canonicalPhoneNumber = "";

                    /**
                     * Creates a new CodeChallenge instance using the specified properties.
                     * @function create
                     * @memberof spotify.login5.v3.challenges.CodeChallenge
                     * @static
                     * @param {spotify.login5.v3.challenges.ICodeChallenge=} [properties] Properties to set
                     * @returns {spotify.login5.v3.challenges.CodeChallenge} CodeChallenge instance
                     */
                    CodeChallenge.create = function create(properties) {
                        return new CodeChallenge(properties);
                    };

                    /**
                     * Encodes the specified CodeChallenge message. Does not implicitly {@link spotify.login5.v3.challenges.CodeChallenge.verify|verify} messages.
                     * @function encode
                     * @memberof spotify.login5.v3.challenges.CodeChallenge
                     * @static
                     * @param {spotify.login5.v3.challenges.ICodeChallenge} message CodeChallenge message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    CodeChallenge.encode = function encode(message, writer) {
                        if (!writer)
                            writer = $Writer.create();
                        if (message.method != null && Object.hasOwnProperty.call(message, "method"))
                            writer.uint32(/* id 1, wireType 0 =*/8).int32(message.method);
                        if (message.codeLength != null && Object.hasOwnProperty.call(message, "codeLength"))
                            writer.uint32(/* id 2, wireType 0 =*/16).int32(message.codeLength);
                        if (message.expiresIn != null && Object.hasOwnProperty.call(message, "expiresIn"))
                            writer.uint32(/* id 3, wireType 0 =*/24).int32(message.expiresIn);
                        if (message.canonicalPhoneNumber != null && Object.hasOwnProperty.call(message, "canonicalPhoneNumber"))
                            writer.uint32(/* id 4, wireType 2 =*/34).string(message.canonicalPhoneNumber);
                        return writer;
                    };

                    /**
                     * Encodes the specified CodeChallenge message, length delimited. Does not implicitly {@link spotify.login5.v3.challenges.CodeChallenge.verify|verify} messages.
                     * @function encodeDelimited
                     * @memberof spotify.login5.v3.challenges.CodeChallenge
                     * @static
                     * @param {spotify.login5.v3.challenges.ICodeChallenge} message CodeChallenge message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    CodeChallenge.encodeDelimited = function encodeDelimited(message, writer) {
                        return this.encode(message, writer).ldelim();
                    };

                    /**
                     * Decodes a CodeChallenge message from the specified reader or buffer.
                     * @function decode
                     * @memberof spotify.login5.v3.challenges.CodeChallenge
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @param {number} [length] Message length if known beforehand
                     * @returns {spotify.login5.v3.challenges.CodeChallenge} CodeChallenge
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    CodeChallenge.decode = function decode(reader, length) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.challenges.CodeChallenge();
                        while (reader.pos < end) {
                            var tag = reader.uint32();
                            switch (tag >>> 3) {
                            case 1: {
                                    message.method = reader.int32();
                                    break;
                                }
                            case 2: {
                                    message.codeLength = reader.int32();
                                    break;
                                }
                            case 3: {
                                    message.expiresIn = reader.int32();
                                    break;
                                }
                            case 4: {
                                    message.canonicalPhoneNumber = reader.string();
                                    break;
                                }
                            default:
                                reader.skipType(tag & 7);
                                break;
                            }
                        }
                        return message;
                    };

                    /**
                     * Decodes a CodeChallenge message from the specified reader or buffer, length delimited.
                     * @function decodeDelimited
                     * @memberof spotify.login5.v3.challenges.CodeChallenge
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @returns {spotify.login5.v3.challenges.CodeChallenge} CodeChallenge
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    CodeChallenge.decodeDelimited = function decodeDelimited(reader) {
                        if (!(reader instanceof $Reader))
                            reader = new $Reader(reader);
                        return this.decode(reader, reader.uint32());
                    };

                    /**
                     * Verifies a CodeChallenge message.
                     * @function verify
                     * @memberof spotify.login5.v3.challenges.CodeChallenge
                     * @static
                     * @param {Object.<string,*>} message Plain object to verify
                     * @returns {string|null} `null` if valid, otherwise the reason why it is not
                     */
                    CodeChallenge.verify = function verify(message) {
                        if (typeof message !== "object" || message === null)
                            return "object expected";
                        if (message.method != null && message.hasOwnProperty("method"))
                            switch (message.method) {
                            default:
                                return "method: enum value expected";
                            case 0:
                            case 1:
                                break;
                            }
                        if (message.codeLength != null && message.hasOwnProperty("codeLength"))
                            if (!$util.isInteger(message.codeLength))
                                return "codeLength: integer expected";
                        if (message.expiresIn != null && message.hasOwnProperty("expiresIn"))
                            if (!$util.isInteger(message.expiresIn))
                                return "expiresIn: integer expected";
                        if (message.canonicalPhoneNumber != null && message.hasOwnProperty("canonicalPhoneNumber"))
                            if (!$util.isString(message.canonicalPhoneNumber))
                                return "canonicalPhoneNumber: string expected";
                        return null;
                    };

                    /**
                     * Creates a CodeChallenge message from a plain object. Also converts values to their respective internal types.
                     * @function fromObject
                     * @memberof spotify.login5.v3.challenges.CodeChallenge
                     * @static
                     * @param {Object.<string,*>} object Plain object
                     * @returns {spotify.login5.v3.challenges.CodeChallenge} CodeChallenge
                     */
                    CodeChallenge.fromObject = function fromObject(object) {
                        if (object instanceof $root.spotify.login5.v3.challenges.CodeChallenge)
                            return object;
                        var message = new $root.spotify.login5.v3.challenges.CodeChallenge();
                        switch (object.method) {
                        default:
                            if (typeof object.method === "number") {
                                message.method = object.method;
                                break;
                            }
                            break;
                        case "UNKNOWN":
                        case 0:
                            message.method = 0;
                            break;
                        case "SMS":
                        case 1:
                            message.method = 1;
                            break;
                        }
                        if (object.codeLength != null)
                            message.codeLength = object.codeLength | 0;
                        if (object.expiresIn != null)
                            message.expiresIn = object.expiresIn | 0;
                        if (object.canonicalPhoneNumber != null)
                            message.canonicalPhoneNumber = String(object.canonicalPhoneNumber);
                        return message;
                    };

                    /**
                     * Creates a plain object from a CodeChallenge message. Also converts values to other types if specified.
                     * @function toObject
                     * @memberof spotify.login5.v3.challenges.CodeChallenge
                     * @static
                     * @param {spotify.login5.v3.challenges.CodeChallenge} message CodeChallenge
                     * @param {$protobuf.IConversionOptions} [options] Conversion options
                     * @returns {Object.<string,*>} Plain object
                     */
                    CodeChallenge.toObject = function toObject(message, options) {
                        if (!options)
                            options = {};
                        var object = {};
                        if (options.defaults) {
                            object.method = options.enums === String ? "UNKNOWN" : 0;
                            object.codeLength = 0;
                            object.expiresIn = 0;
                            object.canonicalPhoneNumber = "";
                        }
                        if (message.method != null && message.hasOwnProperty("method"))
                            object.method = options.enums === String ? $root.spotify.login5.v3.challenges.CodeChallenge.Method[message.method] === undefined ? message.method : $root.spotify.login5.v3.challenges.CodeChallenge.Method[message.method] : message.method;
                        if (message.codeLength != null && message.hasOwnProperty("codeLength"))
                            object.codeLength = message.codeLength;
                        if (message.expiresIn != null && message.hasOwnProperty("expiresIn"))
                            object.expiresIn = message.expiresIn;
                        if (message.canonicalPhoneNumber != null && message.hasOwnProperty("canonicalPhoneNumber"))
                            object.canonicalPhoneNumber = message.canonicalPhoneNumber;
                        return object;
                    };

                    /**
                     * Converts this CodeChallenge to JSON.
                     * @function toJSON
                     * @memberof spotify.login5.v3.challenges.CodeChallenge
                     * @instance
                     * @returns {Object.<string,*>} JSON object
                     */
                    CodeChallenge.prototype.toJSON = function toJSON() {
                        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                    };

                    /**
                     * Gets the default type url for CodeChallenge
                     * @function getTypeUrl
                     * @memberof spotify.login5.v3.challenges.CodeChallenge
                     * @static
                     * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                     * @returns {string} The default type url
                     */
                    CodeChallenge.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                        if (typeUrlPrefix === undefined) {
                            typeUrlPrefix = "type.googleapis.com";
                        }
                        return typeUrlPrefix + "/spotify.login5.v3.challenges.CodeChallenge";
                    };

                    /**
                     * Method enum.
                     * @name spotify.login5.v3.challenges.CodeChallenge.Method
                     * @enum {number}
                     * @property {number} UNKNOWN=0 UNKNOWN value
                     * @property {number} SMS=1 SMS value
                     */
                    CodeChallenge.Method = (function() {
                        var valuesById = {}, values = Object.create(valuesById);
                        values[valuesById[0] = "UNKNOWN"] = 0;
                        values[valuesById[1] = "SMS"] = 1;
                        return values;
                    })();

                    return CodeChallenge;
                })();

                challenges.CodeSolution = (function() {

                    /**
                     * Properties of a CodeSolution.
                     * @memberof spotify.login5.v3.challenges
                     * @interface ICodeSolution
                     * @property {string|null} [code] CodeSolution code
                     */

                    /**
                     * Constructs a new CodeSolution.
                     * @memberof spotify.login5.v3.challenges
                     * @classdesc Represents a CodeSolution.
                     * @implements ICodeSolution
                     * @constructor
                     * @param {spotify.login5.v3.challenges.ICodeSolution=} [properties] Properties to set
                     */
                    function CodeSolution(properties) {
                        if (properties)
                            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null)
                                    this[keys[i]] = properties[keys[i]];
                    }

                    /**
                     * CodeSolution code.
                     * @member {string} code
                     * @memberof spotify.login5.v3.challenges.CodeSolution
                     * @instance
                     */
                    CodeSolution.prototype.code = "";

                    /**
                     * Creates a new CodeSolution instance using the specified properties.
                     * @function create
                     * @memberof spotify.login5.v3.challenges.CodeSolution
                     * @static
                     * @param {spotify.login5.v3.challenges.ICodeSolution=} [properties] Properties to set
                     * @returns {spotify.login5.v3.challenges.CodeSolution} CodeSolution instance
                     */
                    CodeSolution.create = function create(properties) {
                        return new CodeSolution(properties);
                    };

                    /**
                     * Encodes the specified CodeSolution message. Does not implicitly {@link spotify.login5.v3.challenges.CodeSolution.verify|verify} messages.
                     * @function encode
                     * @memberof spotify.login5.v3.challenges.CodeSolution
                     * @static
                     * @param {spotify.login5.v3.challenges.ICodeSolution} message CodeSolution message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    CodeSolution.encode = function encode(message, writer) {
                        if (!writer)
                            writer = $Writer.create();
                        if (message.code != null && Object.hasOwnProperty.call(message, "code"))
                            writer.uint32(/* id 1, wireType 2 =*/10).string(message.code);
                        return writer;
                    };

                    /**
                     * Encodes the specified CodeSolution message, length delimited. Does not implicitly {@link spotify.login5.v3.challenges.CodeSolution.verify|verify} messages.
                     * @function encodeDelimited
                     * @memberof spotify.login5.v3.challenges.CodeSolution
                     * @static
                     * @param {spotify.login5.v3.challenges.ICodeSolution} message CodeSolution message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    CodeSolution.encodeDelimited = function encodeDelimited(message, writer) {
                        return this.encode(message, writer).ldelim();
                    };

                    /**
                     * Decodes a CodeSolution message from the specified reader or buffer.
                     * @function decode
                     * @memberof spotify.login5.v3.challenges.CodeSolution
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @param {number} [length] Message length if known beforehand
                     * @returns {spotify.login5.v3.challenges.CodeSolution} CodeSolution
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    CodeSolution.decode = function decode(reader, length) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.challenges.CodeSolution();
                        while (reader.pos < end) {
                            var tag = reader.uint32();
                            switch (tag >>> 3) {
                            case 1: {
                                    message.code = reader.string();
                                    break;
                                }
                            default:
                                reader.skipType(tag & 7);
                                break;
                            }
                        }
                        return message;
                    };

                    /**
                     * Decodes a CodeSolution message from the specified reader or buffer, length delimited.
                     * @function decodeDelimited
                     * @memberof spotify.login5.v3.challenges.CodeSolution
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @returns {spotify.login5.v3.challenges.CodeSolution} CodeSolution
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    CodeSolution.decodeDelimited = function decodeDelimited(reader) {
                        if (!(reader instanceof $Reader))
                            reader = new $Reader(reader);
                        return this.decode(reader, reader.uint32());
                    };

                    /**
                     * Verifies a CodeSolution message.
                     * @function verify
                     * @memberof spotify.login5.v3.challenges.CodeSolution
                     * @static
                     * @param {Object.<string,*>} message Plain object to verify
                     * @returns {string|null} `null` if valid, otherwise the reason why it is not
                     */
                    CodeSolution.verify = function verify(message) {
                        if (typeof message !== "object" || message === null)
                            return "object expected";
                        if (message.code != null && message.hasOwnProperty("code"))
                            if (!$util.isString(message.code))
                                return "code: string expected";
                        return null;
                    };

                    /**
                     * Creates a CodeSolution message from a plain object. Also converts values to their respective internal types.
                     * @function fromObject
                     * @memberof spotify.login5.v3.challenges.CodeSolution
                     * @static
                     * @param {Object.<string,*>} object Plain object
                     * @returns {spotify.login5.v3.challenges.CodeSolution} CodeSolution
                     */
                    CodeSolution.fromObject = function fromObject(object) {
                        if (object instanceof $root.spotify.login5.v3.challenges.CodeSolution)
                            return object;
                        var message = new $root.spotify.login5.v3.challenges.CodeSolution();
                        if (object.code != null)
                            message.code = String(object.code);
                        return message;
                    };

                    /**
                     * Creates a plain object from a CodeSolution message. Also converts values to other types if specified.
                     * @function toObject
                     * @memberof spotify.login5.v3.challenges.CodeSolution
                     * @static
                     * @param {spotify.login5.v3.challenges.CodeSolution} message CodeSolution
                     * @param {$protobuf.IConversionOptions} [options] Conversion options
                     * @returns {Object.<string,*>} Plain object
                     */
                    CodeSolution.toObject = function toObject(message, options) {
                        if (!options)
                            options = {};
                        var object = {};
                        if (options.defaults)
                            object.code = "";
                        if (message.code != null && message.hasOwnProperty("code"))
                            object.code = message.code;
                        return object;
                    };

                    /**
                     * Converts this CodeSolution to JSON.
                     * @function toJSON
                     * @memberof spotify.login5.v3.challenges.CodeSolution
                     * @instance
                     * @returns {Object.<string,*>} JSON object
                     */
                    CodeSolution.prototype.toJSON = function toJSON() {
                        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                    };

                    /**
                     * Gets the default type url for CodeSolution
                     * @function getTypeUrl
                     * @memberof spotify.login5.v3.challenges.CodeSolution
                     * @static
                     * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                     * @returns {string} The default type url
                     */
                    CodeSolution.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                        if (typeUrlPrefix === undefined) {
                            typeUrlPrefix = "type.googleapis.com";
                        }
                        return typeUrlPrefix + "/spotify.login5.v3.challenges.CodeSolution";
                    };

                    return CodeSolution;
                })();

                challenges.HashcashChallenge = (function() {

                    /**
                     * Properties of a HashcashChallenge.
                     * @memberof spotify.login5.v3.challenges
                     * @interface IHashcashChallenge
                     * @property {Uint8Array|null} [prefix] HashcashChallenge prefix
                     * @property {number|null} [length] HashcashChallenge length
                     */

                    /**
                     * Constructs a new HashcashChallenge.
                     * @memberof spotify.login5.v3.challenges
                     * @classdesc Represents a HashcashChallenge.
                     * @implements IHashcashChallenge
                     * @constructor
                     * @param {spotify.login5.v3.challenges.IHashcashChallenge=} [properties] Properties to set
                     */
                    function HashcashChallenge(properties) {
                        if (properties)
                            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null)
                                    this[keys[i]] = properties[keys[i]];
                    }

                    /**
                     * HashcashChallenge prefix.
                     * @member {Uint8Array} prefix
                     * @memberof spotify.login5.v3.challenges.HashcashChallenge
                     * @instance
                     */
                    HashcashChallenge.prototype.prefix = $util.newBuffer([]);

                    /**
                     * HashcashChallenge length.
                     * @member {number} length
                     * @memberof spotify.login5.v3.challenges.HashcashChallenge
                     * @instance
                     */
                    HashcashChallenge.prototype.length = 0;

                    /**
                     * Creates a new HashcashChallenge instance using the specified properties.
                     * @function create
                     * @memberof spotify.login5.v3.challenges.HashcashChallenge
                     * @static
                     * @param {spotify.login5.v3.challenges.IHashcashChallenge=} [properties] Properties to set
                     * @returns {spotify.login5.v3.challenges.HashcashChallenge} HashcashChallenge instance
                     */
                    HashcashChallenge.create = function create(properties) {
                        return new HashcashChallenge(properties);
                    };

                    /**
                     * Encodes the specified HashcashChallenge message. Does not implicitly {@link spotify.login5.v3.challenges.HashcashChallenge.verify|verify} messages.
                     * @function encode
                     * @memberof spotify.login5.v3.challenges.HashcashChallenge
                     * @static
                     * @param {spotify.login5.v3.challenges.IHashcashChallenge} message HashcashChallenge message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    HashcashChallenge.encode = function encode(message, writer) {
                        if (!writer)
                            writer = $Writer.create();
                        if (message.prefix != null && Object.hasOwnProperty.call(message, "prefix"))
                            writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.prefix);
                        if (message.length != null && Object.hasOwnProperty.call(message, "length"))
                            writer.uint32(/* id 2, wireType 0 =*/16).int32(message.length);
                        return writer;
                    };

                    /**
                     * Encodes the specified HashcashChallenge message, length delimited. Does not implicitly {@link spotify.login5.v3.challenges.HashcashChallenge.verify|verify} messages.
                     * @function encodeDelimited
                     * @memberof spotify.login5.v3.challenges.HashcashChallenge
                     * @static
                     * @param {spotify.login5.v3.challenges.IHashcashChallenge} message HashcashChallenge message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    HashcashChallenge.encodeDelimited = function encodeDelimited(message, writer) {
                        return this.encode(message, writer).ldelim();
                    };

                    /**
                     * Decodes a HashcashChallenge message from the specified reader or buffer.
                     * @function decode
                     * @memberof spotify.login5.v3.challenges.HashcashChallenge
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @param {number} [length] Message length if known beforehand
                     * @returns {spotify.login5.v3.challenges.HashcashChallenge} HashcashChallenge
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    HashcashChallenge.decode = function decode(reader, length) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.challenges.HashcashChallenge();
                        while (reader.pos < end) {
                            var tag = reader.uint32();
                            switch (tag >>> 3) {
                            case 1: {
                                    message.prefix = reader.bytes();
                                    break;
                                }
                            case 2: {
                                    message.length = reader.int32();
                                    break;
                                }
                            default:
                                reader.skipType(tag & 7);
                                break;
                            }
                        }
                        return message;
                    };

                    /**
                     * Decodes a HashcashChallenge message from the specified reader or buffer, length delimited.
                     * @function decodeDelimited
                     * @memberof spotify.login5.v3.challenges.HashcashChallenge
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @returns {spotify.login5.v3.challenges.HashcashChallenge} HashcashChallenge
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    HashcashChallenge.decodeDelimited = function decodeDelimited(reader) {
                        if (!(reader instanceof $Reader))
                            reader = new $Reader(reader);
                        return this.decode(reader, reader.uint32());
                    };

                    /**
                     * Verifies a HashcashChallenge message.
                     * @function verify
                     * @memberof spotify.login5.v3.challenges.HashcashChallenge
                     * @static
                     * @param {Object.<string,*>} message Plain object to verify
                     * @returns {string|null} `null` if valid, otherwise the reason why it is not
                     */
                    HashcashChallenge.verify = function verify(message) {
                        if (typeof message !== "object" || message === null)
                            return "object expected";
                        if (message.prefix != null && message.hasOwnProperty("prefix"))
                            if (!(message.prefix && typeof message.prefix.length === "number" || $util.isString(message.prefix)))
                                return "prefix: buffer expected";
                        if (message.length != null && message.hasOwnProperty("length"))
                            if (!$util.isInteger(message.length))
                                return "length: integer expected";
                        return null;
                    };

                    /**
                     * Creates a HashcashChallenge message from a plain object. Also converts values to their respective internal types.
                     * @function fromObject
                     * @memberof spotify.login5.v3.challenges.HashcashChallenge
                     * @static
                     * @param {Object.<string,*>} object Plain object
                     * @returns {spotify.login5.v3.challenges.HashcashChallenge} HashcashChallenge
                     */
                    HashcashChallenge.fromObject = function fromObject(object) {
                        if (object instanceof $root.spotify.login5.v3.challenges.HashcashChallenge)
                            return object;
                        var message = new $root.spotify.login5.v3.challenges.HashcashChallenge();
                        if (object.prefix != null)
                            if (typeof object.prefix === "string")
                                $util.base64.decode(object.prefix, message.prefix = $util.newBuffer($util.base64.length(object.prefix)), 0);
                            else if (object.prefix.length >= 0)
                                message.prefix = object.prefix;
                        if (object.length != null)
                            message.length = object.length | 0;
                        return message;
                    };

                    /**
                     * Creates a plain object from a HashcashChallenge message. Also converts values to other types if specified.
                     * @function toObject
                     * @memberof spotify.login5.v3.challenges.HashcashChallenge
                     * @static
                     * @param {spotify.login5.v3.challenges.HashcashChallenge} message HashcashChallenge
                     * @param {$protobuf.IConversionOptions} [options] Conversion options
                     * @returns {Object.<string,*>} Plain object
                     */
                    HashcashChallenge.toObject = function toObject(message, options) {
                        if (!options)
                            options = {};
                        var object = {};
                        if (options.defaults) {
                            if (options.bytes === String)
                                object.prefix = "";
                            else {
                                object.prefix = [];
                                if (options.bytes !== Array)
                                    object.prefix = $util.newBuffer(object.prefix);
                            }
                            object.length = 0;
                        }
                        if (message.prefix != null && message.hasOwnProperty("prefix"))
                            object.prefix = options.bytes === String ? $util.base64.encode(message.prefix, 0, message.prefix.length) : options.bytes === Array ? Array.prototype.slice.call(message.prefix) : message.prefix;
                        if (message.length != null && message.hasOwnProperty("length"))
                            object.length = message.length;
                        return object;
                    };

                    /**
                     * Converts this HashcashChallenge to JSON.
                     * @function toJSON
                     * @memberof spotify.login5.v3.challenges.HashcashChallenge
                     * @instance
                     * @returns {Object.<string,*>} JSON object
                     */
                    HashcashChallenge.prototype.toJSON = function toJSON() {
                        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                    };

                    /**
                     * Gets the default type url for HashcashChallenge
                     * @function getTypeUrl
                     * @memberof spotify.login5.v3.challenges.HashcashChallenge
                     * @static
                     * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                     * @returns {string} The default type url
                     */
                    HashcashChallenge.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                        if (typeUrlPrefix === undefined) {
                            typeUrlPrefix = "type.googleapis.com";
                        }
                        return typeUrlPrefix + "/spotify.login5.v3.challenges.HashcashChallenge";
                    };

                    return HashcashChallenge;
                })();

                challenges.HashcashSolution = (function() {

                    /**
                     * Properties of a HashcashSolution.
                     * @memberof spotify.login5.v3.challenges
                     * @interface IHashcashSolution
                     * @property {Uint8Array|null} [suffix] HashcashSolution suffix
                     * @property {google.protobuf.IDuration|null} [duration] HashcashSolution duration
                     */

                    /**
                     * Constructs a new HashcashSolution.
                     * @memberof spotify.login5.v3.challenges
                     * @classdesc Represents a HashcashSolution.
                     * @implements IHashcashSolution
                     * @constructor
                     * @param {spotify.login5.v3.challenges.IHashcashSolution=} [properties] Properties to set
                     */
                    function HashcashSolution(properties) {
                        if (properties)
                            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null)
                                    this[keys[i]] = properties[keys[i]];
                    }

                    /**
                     * HashcashSolution suffix.
                     * @member {Uint8Array} suffix
                     * @memberof spotify.login5.v3.challenges.HashcashSolution
                     * @instance
                     */
                    HashcashSolution.prototype.suffix = $util.newBuffer([]);

                    /**
                     * HashcashSolution duration.
                     * @member {google.protobuf.IDuration|null|undefined} duration
                     * @memberof spotify.login5.v3.challenges.HashcashSolution
                     * @instance
                     */
                    HashcashSolution.prototype.duration = null;

                    /**
                     * Creates a new HashcashSolution instance using the specified properties.
                     * @function create
                     * @memberof spotify.login5.v3.challenges.HashcashSolution
                     * @static
                     * @param {spotify.login5.v3.challenges.IHashcashSolution=} [properties] Properties to set
                     * @returns {spotify.login5.v3.challenges.HashcashSolution} HashcashSolution instance
                     */
                    HashcashSolution.create = function create(properties) {
                        return new HashcashSolution(properties);
                    };

                    /**
                     * Encodes the specified HashcashSolution message. Does not implicitly {@link spotify.login5.v3.challenges.HashcashSolution.verify|verify} messages.
                     * @function encode
                     * @memberof spotify.login5.v3.challenges.HashcashSolution
                     * @static
                     * @param {spotify.login5.v3.challenges.IHashcashSolution} message HashcashSolution message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    HashcashSolution.encode = function encode(message, writer) {
                        if (!writer)
                            writer = $Writer.create();
                        if (message.suffix != null && Object.hasOwnProperty.call(message, "suffix"))
                            writer.uint32(/* id 1, wireType 2 =*/10).bytes(message.suffix);
                        if (message.duration != null && Object.hasOwnProperty.call(message, "duration"))
                            $root.google.protobuf.Duration.encode(message.duration, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
                        return writer;
                    };

                    /**
                     * Encodes the specified HashcashSolution message, length delimited. Does not implicitly {@link spotify.login5.v3.challenges.HashcashSolution.verify|verify} messages.
                     * @function encodeDelimited
                     * @memberof spotify.login5.v3.challenges.HashcashSolution
                     * @static
                     * @param {spotify.login5.v3.challenges.IHashcashSolution} message HashcashSolution message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    HashcashSolution.encodeDelimited = function encodeDelimited(message, writer) {
                        return this.encode(message, writer).ldelim();
                    };

                    /**
                     * Decodes a HashcashSolution message from the specified reader or buffer.
                     * @function decode
                     * @memberof spotify.login5.v3.challenges.HashcashSolution
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @param {number} [length] Message length if known beforehand
                     * @returns {spotify.login5.v3.challenges.HashcashSolution} HashcashSolution
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    HashcashSolution.decode = function decode(reader, length) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.challenges.HashcashSolution();
                        while (reader.pos < end) {
                            var tag = reader.uint32();
                            switch (tag >>> 3) {
                            case 1: {
                                    message.suffix = reader.bytes();
                                    break;
                                }
                            case 2: {
                                    message.duration = $root.google.protobuf.Duration.decode(reader, reader.uint32());
                                    break;
                                }
                            default:
                                reader.skipType(tag & 7);
                                break;
                            }
                        }
                        return message;
                    };

                    /**
                     * Decodes a HashcashSolution message from the specified reader or buffer, length delimited.
                     * @function decodeDelimited
                     * @memberof spotify.login5.v3.challenges.HashcashSolution
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @returns {spotify.login5.v3.challenges.HashcashSolution} HashcashSolution
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    HashcashSolution.decodeDelimited = function decodeDelimited(reader) {
                        if (!(reader instanceof $Reader))
                            reader = new $Reader(reader);
                        return this.decode(reader, reader.uint32());
                    };

                    /**
                     * Verifies a HashcashSolution message.
                     * @function verify
                     * @memberof spotify.login5.v3.challenges.HashcashSolution
                     * @static
                     * @param {Object.<string,*>} message Plain object to verify
                     * @returns {string|null} `null` if valid, otherwise the reason why it is not
                     */
                    HashcashSolution.verify = function verify(message) {
                        if (typeof message !== "object" || message === null)
                            return "object expected";
                        if (message.suffix != null && message.hasOwnProperty("suffix"))
                            if (!(message.suffix && typeof message.suffix.length === "number" || $util.isString(message.suffix)))
                                return "suffix: buffer expected";
                        if (message.duration != null && message.hasOwnProperty("duration")) {
                            var error = $root.google.protobuf.Duration.verify(message.duration);
                            if (error)
                                return "duration." + error;
                        }
                        return null;
                    };

                    /**
                     * Creates a HashcashSolution message from a plain object. Also converts values to their respective internal types.
                     * @function fromObject
                     * @memberof spotify.login5.v3.challenges.HashcashSolution
                     * @static
                     * @param {Object.<string,*>} object Plain object
                     * @returns {spotify.login5.v3.challenges.HashcashSolution} HashcashSolution
                     */
                    HashcashSolution.fromObject = function fromObject(object) {
                        if (object instanceof $root.spotify.login5.v3.challenges.HashcashSolution)
                            return object;
                        var message = new $root.spotify.login5.v3.challenges.HashcashSolution();
                        if (object.suffix != null)
                            if (typeof object.suffix === "string")
                                $util.base64.decode(object.suffix, message.suffix = $util.newBuffer($util.base64.length(object.suffix)), 0);
                            else if (object.suffix.length >= 0)
                                message.suffix = object.suffix;
                        if (object.duration != null) {
                            if (typeof object.duration !== "object")
                                throw TypeError(".spotify.login5.v3.challenges.HashcashSolution.duration: object expected");
                            message.duration = $root.google.protobuf.Duration.fromObject(object.duration);
                        }
                        return message;
                    };

                    /**
                     * Creates a plain object from a HashcashSolution message. Also converts values to other types if specified.
                     * @function toObject
                     * @memberof spotify.login5.v3.challenges.HashcashSolution
                     * @static
                     * @param {spotify.login5.v3.challenges.HashcashSolution} message HashcashSolution
                     * @param {$protobuf.IConversionOptions} [options] Conversion options
                     * @returns {Object.<string,*>} Plain object
                     */
                    HashcashSolution.toObject = function toObject(message, options) {
                        if (!options)
                            options = {};
                        var object = {};
                        if (options.defaults) {
                            if (options.bytes === String)
                                object.suffix = "";
                            else {
                                object.suffix = [];
                                if (options.bytes !== Array)
                                    object.suffix = $util.newBuffer(object.suffix);
                            }
                            object.duration = null;
                        }
                        if (message.suffix != null && message.hasOwnProperty("suffix"))
                            object.suffix = options.bytes === String ? $util.base64.encode(message.suffix, 0, message.suffix.length) : options.bytes === Array ? Array.prototype.slice.call(message.suffix) : message.suffix;
                        if (message.duration != null && message.hasOwnProperty("duration"))
                            object.duration = $root.google.protobuf.Duration.toObject(message.duration, options);
                        return object;
                    };

                    /**
                     * Converts this HashcashSolution to JSON.
                     * @function toJSON
                     * @memberof spotify.login5.v3.challenges.HashcashSolution
                     * @instance
                     * @returns {Object.<string,*>} JSON object
                     */
                    HashcashSolution.prototype.toJSON = function toJSON() {
                        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                    };

                    /**
                     * Gets the default type url for HashcashSolution
                     * @function getTypeUrl
                     * @memberof spotify.login5.v3.challenges.HashcashSolution
                     * @static
                     * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                     * @returns {string} The default type url
                     */
                    HashcashSolution.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                        if (typeUrlPrefix === undefined) {
                            typeUrlPrefix = "type.googleapis.com";
                        }
                        return typeUrlPrefix + "/spotify.login5.v3.challenges.HashcashSolution";
                    };

                    return HashcashSolution;
                })();

                return challenges;
            })();

            v3.credentials = (function() {

                /**
                 * Namespace credentials.
                 * @memberof spotify.login5.v3
                 * @namespace
                 */
                var credentials = {};

                credentials.StoredCredential = (function() {

                    /**
                     * Properties of a StoredCredential.
                     * @memberof spotify.login5.v3.credentials
                     * @interface IStoredCredential
                     * @property {string|null} [username] StoredCredential username
                     * @property {Uint8Array|null} [data] StoredCredential data
                     */

                    /**
                     * Constructs a new StoredCredential.
                     * @memberof spotify.login5.v3.credentials
                     * @classdesc Represents a StoredCredential.
                     * @implements IStoredCredential
                     * @constructor
                     * @param {spotify.login5.v3.credentials.IStoredCredential=} [properties] Properties to set
                     */
                    function StoredCredential(properties) {
                        if (properties)
                            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null)
                                    this[keys[i]] = properties[keys[i]];
                    }

                    /**
                     * StoredCredential username.
                     * @member {string} username
                     * @memberof spotify.login5.v3.credentials.StoredCredential
                     * @instance
                     */
                    StoredCredential.prototype.username = "";

                    /**
                     * StoredCredential data.
                     * @member {Uint8Array} data
                     * @memberof spotify.login5.v3.credentials.StoredCredential
                     * @instance
                     */
                    StoredCredential.prototype.data = $util.newBuffer([]);

                    /**
                     * Creates a new StoredCredential instance using the specified properties.
                     * @function create
                     * @memberof spotify.login5.v3.credentials.StoredCredential
                     * @static
                     * @param {spotify.login5.v3.credentials.IStoredCredential=} [properties] Properties to set
                     * @returns {spotify.login5.v3.credentials.StoredCredential} StoredCredential instance
                     */
                    StoredCredential.create = function create(properties) {
                        return new StoredCredential(properties);
                    };

                    /**
                     * Encodes the specified StoredCredential message. Does not implicitly {@link spotify.login5.v3.credentials.StoredCredential.verify|verify} messages.
                     * @function encode
                     * @memberof spotify.login5.v3.credentials.StoredCredential
                     * @static
                     * @param {spotify.login5.v3.credentials.IStoredCredential} message StoredCredential message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    StoredCredential.encode = function encode(message, writer) {
                        if (!writer)
                            writer = $Writer.create();
                        if (message.username != null && Object.hasOwnProperty.call(message, "username"))
                            writer.uint32(/* id 1, wireType 2 =*/10).string(message.username);
                        if (message.data != null && Object.hasOwnProperty.call(message, "data"))
                            writer.uint32(/* id 2, wireType 2 =*/18).bytes(message.data);
                        return writer;
                    };

                    /**
                     * Encodes the specified StoredCredential message, length delimited. Does not implicitly {@link spotify.login5.v3.credentials.StoredCredential.verify|verify} messages.
                     * @function encodeDelimited
                     * @memberof spotify.login5.v3.credentials.StoredCredential
                     * @static
                     * @param {spotify.login5.v3.credentials.IStoredCredential} message StoredCredential message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    StoredCredential.encodeDelimited = function encodeDelimited(message, writer) {
                        return this.encode(message, writer).ldelim();
                    };

                    /**
                     * Decodes a StoredCredential message from the specified reader or buffer.
                     * @function decode
                     * @memberof spotify.login5.v3.credentials.StoredCredential
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @param {number} [length] Message length if known beforehand
                     * @returns {spotify.login5.v3.credentials.StoredCredential} StoredCredential
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    StoredCredential.decode = function decode(reader, length) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.credentials.StoredCredential();
                        while (reader.pos < end) {
                            var tag = reader.uint32();
                            switch (tag >>> 3) {
                            case 1: {
                                    message.username = reader.string();
                                    break;
                                }
                            case 2: {
                                    message.data = reader.bytes();
                                    break;
                                }
                            default:
                                reader.skipType(tag & 7);
                                break;
                            }
                        }
                        return message;
                    };

                    /**
                     * Decodes a StoredCredential message from the specified reader or buffer, length delimited.
                     * @function decodeDelimited
                     * @memberof spotify.login5.v3.credentials.StoredCredential
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @returns {spotify.login5.v3.credentials.StoredCredential} StoredCredential
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    StoredCredential.decodeDelimited = function decodeDelimited(reader) {
                        if (!(reader instanceof $Reader))
                            reader = new $Reader(reader);
                        return this.decode(reader, reader.uint32());
                    };

                    /**
                     * Verifies a StoredCredential message.
                     * @function verify
                     * @memberof spotify.login5.v3.credentials.StoredCredential
                     * @static
                     * @param {Object.<string,*>} message Plain object to verify
                     * @returns {string|null} `null` if valid, otherwise the reason why it is not
                     */
                    StoredCredential.verify = function verify(message) {
                        if (typeof message !== "object" || message === null)
                            return "object expected";
                        if (message.username != null && message.hasOwnProperty("username"))
                            if (!$util.isString(message.username))
                                return "username: string expected";
                        if (message.data != null && message.hasOwnProperty("data"))
                            if (!(message.data && typeof message.data.length === "number" || $util.isString(message.data)))
                                return "data: buffer expected";
                        return null;
                    };

                    /**
                     * Creates a StoredCredential message from a plain object. Also converts values to their respective internal types.
                     * @function fromObject
                     * @memberof spotify.login5.v3.credentials.StoredCredential
                     * @static
                     * @param {Object.<string,*>} object Plain object
                     * @returns {spotify.login5.v3.credentials.StoredCredential} StoredCredential
                     */
                    StoredCredential.fromObject = function fromObject(object) {
                        if (object instanceof $root.spotify.login5.v3.credentials.StoredCredential)
                            return object;
                        var message = new $root.spotify.login5.v3.credentials.StoredCredential();
                        if (object.username != null)
                            message.username = String(object.username);
                        if (object.data != null)
                            if (typeof object.data === "string")
                                $util.base64.decode(object.data, message.data = $util.newBuffer($util.base64.length(object.data)), 0);
                            else if (object.data.length >= 0)
                                message.data = object.data;
                        return message;
                    };

                    /**
                     * Creates a plain object from a StoredCredential message. Also converts values to other types if specified.
                     * @function toObject
                     * @memberof spotify.login5.v3.credentials.StoredCredential
                     * @static
                     * @param {spotify.login5.v3.credentials.StoredCredential} message StoredCredential
                     * @param {$protobuf.IConversionOptions} [options] Conversion options
                     * @returns {Object.<string,*>} Plain object
                     */
                    StoredCredential.toObject = function toObject(message, options) {
                        if (!options)
                            options = {};
                        var object = {};
                        if (options.defaults) {
                            object.username = "";
                            if (options.bytes === String)
                                object.data = "";
                            else {
                                object.data = [];
                                if (options.bytes !== Array)
                                    object.data = $util.newBuffer(object.data);
                            }
                        }
                        if (message.username != null && message.hasOwnProperty("username"))
                            object.username = message.username;
                        if (message.data != null && message.hasOwnProperty("data"))
                            object.data = options.bytes === String ? $util.base64.encode(message.data, 0, message.data.length) : options.bytes === Array ? Array.prototype.slice.call(message.data) : message.data;
                        return object;
                    };

                    /**
                     * Converts this StoredCredential to JSON.
                     * @function toJSON
                     * @memberof spotify.login5.v3.credentials.StoredCredential
                     * @instance
                     * @returns {Object.<string,*>} JSON object
                     */
                    StoredCredential.prototype.toJSON = function toJSON() {
                        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                    };

                    /**
                     * Gets the default type url for StoredCredential
                     * @function getTypeUrl
                     * @memberof spotify.login5.v3.credentials.StoredCredential
                     * @static
                     * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                     * @returns {string} The default type url
                     */
                    StoredCredential.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                        if (typeUrlPrefix === undefined) {
                            typeUrlPrefix = "type.googleapis.com";
                        }
                        return typeUrlPrefix + "/spotify.login5.v3.credentials.StoredCredential";
                    };

                    return StoredCredential;
                })();

                credentials.Password = (function() {

                    /**
                     * Properties of a Password.
                     * @memberof spotify.login5.v3.credentials
                     * @interface IPassword
                     * @property {string|null} [id] Password id
                     * @property {string|null} [password] Password password
                     * @property {Uint8Array|null} [padding] Password padding
                     */

                    /**
                     * Constructs a new Password.
                     * @memberof spotify.login5.v3.credentials
                     * @classdesc Represents a Password.
                     * @implements IPassword
                     * @constructor
                     * @param {spotify.login5.v3.credentials.IPassword=} [properties] Properties to set
                     */
                    function Password(properties) {
                        if (properties)
                            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null)
                                    this[keys[i]] = properties[keys[i]];
                    }

                    /**
                     * Password id.
                     * @member {string} id
                     * @memberof spotify.login5.v3.credentials.Password
                     * @instance
                     */
                    Password.prototype.id = "";

                    /**
                     * Password password.
                     * @member {string} password
                     * @memberof spotify.login5.v3.credentials.Password
                     * @instance
                     */
                    Password.prototype.password = "";

                    /**
                     * Password padding.
                     * @member {Uint8Array} padding
                     * @memberof spotify.login5.v3.credentials.Password
                     * @instance
                     */
                    Password.prototype.padding = $util.newBuffer([]);

                    /**
                     * Creates a new Password instance using the specified properties.
                     * @function create
                     * @memberof spotify.login5.v3.credentials.Password
                     * @static
                     * @param {spotify.login5.v3.credentials.IPassword=} [properties] Properties to set
                     * @returns {spotify.login5.v3.credentials.Password} Password instance
                     */
                    Password.create = function create(properties) {
                        return new Password(properties);
                    };

                    /**
                     * Encodes the specified Password message. Does not implicitly {@link spotify.login5.v3.credentials.Password.verify|verify} messages.
                     * @function encode
                     * @memberof spotify.login5.v3.credentials.Password
                     * @static
                     * @param {spotify.login5.v3.credentials.IPassword} message Password message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    Password.encode = function encode(message, writer) {
                        if (!writer)
                            writer = $Writer.create();
                        if (message.id != null && Object.hasOwnProperty.call(message, "id"))
                            writer.uint32(/* id 1, wireType 2 =*/10).string(message.id);
                        if (message.password != null && Object.hasOwnProperty.call(message, "password"))
                            writer.uint32(/* id 2, wireType 2 =*/18).string(message.password);
                        if (message.padding != null && Object.hasOwnProperty.call(message, "padding"))
                            writer.uint32(/* id 3, wireType 2 =*/26).bytes(message.padding);
                        return writer;
                    };

                    /**
                     * Encodes the specified Password message, length delimited. Does not implicitly {@link spotify.login5.v3.credentials.Password.verify|verify} messages.
                     * @function encodeDelimited
                     * @memberof spotify.login5.v3.credentials.Password
                     * @static
                     * @param {spotify.login5.v3.credentials.IPassword} message Password message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    Password.encodeDelimited = function encodeDelimited(message, writer) {
                        return this.encode(message, writer).ldelim();
                    };

                    /**
                     * Decodes a Password message from the specified reader or buffer.
                     * @function decode
                     * @memberof spotify.login5.v3.credentials.Password
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @param {number} [length] Message length if known beforehand
                     * @returns {spotify.login5.v3.credentials.Password} Password
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    Password.decode = function decode(reader, length) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.credentials.Password();
                        while (reader.pos < end) {
                            var tag = reader.uint32();
                            switch (tag >>> 3) {
                            case 1: {
                                    message.id = reader.string();
                                    break;
                                }
                            case 2: {
                                    message.password = reader.string();
                                    break;
                                }
                            case 3: {
                                    message.padding = reader.bytes();
                                    break;
                                }
                            default:
                                reader.skipType(tag & 7);
                                break;
                            }
                        }
                        return message;
                    };

                    /**
                     * Decodes a Password message from the specified reader or buffer, length delimited.
                     * @function decodeDelimited
                     * @memberof spotify.login5.v3.credentials.Password
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @returns {spotify.login5.v3.credentials.Password} Password
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    Password.decodeDelimited = function decodeDelimited(reader) {
                        if (!(reader instanceof $Reader))
                            reader = new $Reader(reader);
                        return this.decode(reader, reader.uint32());
                    };

                    /**
                     * Verifies a Password message.
                     * @function verify
                     * @memberof spotify.login5.v3.credentials.Password
                     * @static
                     * @param {Object.<string,*>} message Plain object to verify
                     * @returns {string|null} `null` if valid, otherwise the reason why it is not
                     */
                    Password.verify = function verify(message) {
                        if (typeof message !== "object" || message === null)
                            return "object expected";
                        if (message.id != null && message.hasOwnProperty("id"))
                            if (!$util.isString(message.id))
                                return "id: string expected";
                        if (message.password != null && message.hasOwnProperty("password"))
                            if (!$util.isString(message.password))
                                return "password: string expected";
                        if (message.padding != null && message.hasOwnProperty("padding"))
                            if (!(message.padding && typeof message.padding.length === "number" || $util.isString(message.padding)))
                                return "padding: buffer expected";
                        return null;
                    };

                    /**
                     * Creates a Password message from a plain object. Also converts values to their respective internal types.
                     * @function fromObject
                     * @memberof spotify.login5.v3.credentials.Password
                     * @static
                     * @param {Object.<string,*>} object Plain object
                     * @returns {spotify.login5.v3.credentials.Password} Password
                     */
                    Password.fromObject = function fromObject(object) {
                        if (object instanceof $root.spotify.login5.v3.credentials.Password)
                            return object;
                        var message = new $root.spotify.login5.v3.credentials.Password();
                        if (object.id != null)
                            message.id = String(object.id);
                        if (object.password != null)
                            message.password = String(object.password);
                        if (object.padding != null)
                            if (typeof object.padding === "string")
                                $util.base64.decode(object.padding, message.padding = $util.newBuffer($util.base64.length(object.padding)), 0);
                            else if (object.padding.length >= 0)
                                message.padding = object.padding;
                        return message;
                    };

                    /**
                     * Creates a plain object from a Password message. Also converts values to other types if specified.
                     * @function toObject
                     * @memberof spotify.login5.v3.credentials.Password
                     * @static
                     * @param {spotify.login5.v3.credentials.Password} message Password
                     * @param {$protobuf.IConversionOptions} [options] Conversion options
                     * @returns {Object.<string,*>} Plain object
                     */
                    Password.toObject = function toObject(message, options) {
                        if (!options)
                            options = {};
                        var object = {};
                        if (options.defaults) {
                            object.id = "";
                            object.password = "";
                            if (options.bytes === String)
                                object.padding = "";
                            else {
                                object.padding = [];
                                if (options.bytes !== Array)
                                    object.padding = $util.newBuffer(object.padding);
                            }
                        }
                        if (message.id != null && message.hasOwnProperty("id"))
                            object.id = message.id;
                        if (message.password != null && message.hasOwnProperty("password"))
                            object.password = message.password;
                        if (message.padding != null && message.hasOwnProperty("padding"))
                            object.padding = options.bytes === String ? $util.base64.encode(message.padding, 0, message.padding.length) : options.bytes === Array ? Array.prototype.slice.call(message.padding) : message.padding;
                        return object;
                    };

                    /**
                     * Converts this Password to JSON.
                     * @function toJSON
                     * @memberof spotify.login5.v3.credentials.Password
                     * @instance
                     * @returns {Object.<string,*>} JSON object
                     */
                    Password.prototype.toJSON = function toJSON() {
                        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                    };

                    /**
                     * Gets the default type url for Password
                     * @function getTypeUrl
                     * @memberof spotify.login5.v3.credentials.Password
                     * @static
                     * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                     * @returns {string} The default type url
                     */
                    Password.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                        if (typeUrlPrefix === undefined) {
                            typeUrlPrefix = "type.googleapis.com";
                        }
                        return typeUrlPrefix + "/spotify.login5.v3.credentials.Password";
                    };

                    return Password;
                })();

                credentials.FacebookAccessToken = (function() {

                    /**
                     * Properties of a FacebookAccessToken.
                     * @memberof spotify.login5.v3.credentials
                     * @interface IFacebookAccessToken
                     * @property {string|null} [fbUid] FacebookAccessToken fbUid
                     * @property {string|null} [accessToken] FacebookAccessToken accessToken
                     */

                    /**
                     * Constructs a new FacebookAccessToken.
                     * @memberof spotify.login5.v3.credentials
                     * @classdesc Represents a FacebookAccessToken.
                     * @implements IFacebookAccessToken
                     * @constructor
                     * @param {spotify.login5.v3.credentials.IFacebookAccessToken=} [properties] Properties to set
                     */
                    function FacebookAccessToken(properties) {
                        if (properties)
                            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null)
                                    this[keys[i]] = properties[keys[i]];
                    }

                    /**
                     * FacebookAccessToken fbUid.
                     * @member {string} fbUid
                     * @memberof spotify.login5.v3.credentials.FacebookAccessToken
                     * @instance
                     */
                    FacebookAccessToken.prototype.fbUid = "";

                    /**
                     * FacebookAccessToken accessToken.
                     * @member {string} accessToken
                     * @memberof spotify.login5.v3.credentials.FacebookAccessToken
                     * @instance
                     */
                    FacebookAccessToken.prototype.accessToken = "";

                    /**
                     * Creates a new FacebookAccessToken instance using the specified properties.
                     * @function create
                     * @memberof spotify.login5.v3.credentials.FacebookAccessToken
                     * @static
                     * @param {spotify.login5.v3.credentials.IFacebookAccessToken=} [properties] Properties to set
                     * @returns {spotify.login5.v3.credentials.FacebookAccessToken} FacebookAccessToken instance
                     */
                    FacebookAccessToken.create = function create(properties) {
                        return new FacebookAccessToken(properties);
                    };

                    /**
                     * Encodes the specified FacebookAccessToken message. Does not implicitly {@link spotify.login5.v3.credentials.FacebookAccessToken.verify|verify} messages.
                     * @function encode
                     * @memberof spotify.login5.v3.credentials.FacebookAccessToken
                     * @static
                     * @param {spotify.login5.v3.credentials.IFacebookAccessToken} message FacebookAccessToken message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    FacebookAccessToken.encode = function encode(message, writer) {
                        if (!writer)
                            writer = $Writer.create();
                        if (message.fbUid != null && Object.hasOwnProperty.call(message, "fbUid"))
                            writer.uint32(/* id 1, wireType 2 =*/10).string(message.fbUid);
                        if (message.accessToken != null && Object.hasOwnProperty.call(message, "accessToken"))
                            writer.uint32(/* id 2, wireType 2 =*/18).string(message.accessToken);
                        return writer;
                    };

                    /**
                     * Encodes the specified FacebookAccessToken message, length delimited. Does not implicitly {@link spotify.login5.v3.credentials.FacebookAccessToken.verify|verify} messages.
                     * @function encodeDelimited
                     * @memberof spotify.login5.v3.credentials.FacebookAccessToken
                     * @static
                     * @param {spotify.login5.v3.credentials.IFacebookAccessToken} message FacebookAccessToken message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    FacebookAccessToken.encodeDelimited = function encodeDelimited(message, writer) {
                        return this.encode(message, writer).ldelim();
                    };

                    /**
                     * Decodes a FacebookAccessToken message from the specified reader or buffer.
                     * @function decode
                     * @memberof spotify.login5.v3.credentials.FacebookAccessToken
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @param {number} [length] Message length if known beforehand
                     * @returns {spotify.login5.v3.credentials.FacebookAccessToken} FacebookAccessToken
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    FacebookAccessToken.decode = function decode(reader, length) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.credentials.FacebookAccessToken();
                        while (reader.pos < end) {
                            var tag = reader.uint32();
                            switch (tag >>> 3) {
                            case 1: {
                                    message.fbUid = reader.string();
                                    break;
                                }
                            case 2: {
                                    message.accessToken = reader.string();
                                    break;
                                }
                            default:
                                reader.skipType(tag & 7);
                                break;
                            }
                        }
                        return message;
                    };

                    /**
                     * Decodes a FacebookAccessToken message from the specified reader or buffer, length delimited.
                     * @function decodeDelimited
                     * @memberof spotify.login5.v3.credentials.FacebookAccessToken
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @returns {spotify.login5.v3.credentials.FacebookAccessToken} FacebookAccessToken
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    FacebookAccessToken.decodeDelimited = function decodeDelimited(reader) {
                        if (!(reader instanceof $Reader))
                            reader = new $Reader(reader);
                        return this.decode(reader, reader.uint32());
                    };

                    /**
                     * Verifies a FacebookAccessToken message.
                     * @function verify
                     * @memberof spotify.login5.v3.credentials.FacebookAccessToken
                     * @static
                     * @param {Object.<string,*>} message Plain object to verify
                     * @returns {string|null} `null` if valid, otherwise the reason why it is not
                     */
                    FacebookAccessToken.verify = function verify(message) {
                        if (typeof message !== "object" || message === null)
                            return "object expected";
                        if (message.fbUid != null && message.hasOwnProperty("fbUid"))
                            if (!$util.isString(message.fbUid))
                                return "fbUid: string expected";
                        if (message.accessToken != null && message.hasOwnProperty("accessToken"))
                            if (!$util.isString(message.accessToken))
                                return "accessToken: string expected";
                        return null;
                    };

                    /**
                     * Creates a FacebookAccessToken message from a plain object. Also converts values to their respective internal types.
                     * @function fromObject
                     * @memberof spotify.login5.v3.credentials.FacebookAccessToken
                     * @static
                     * @param {Object.<string,*>} object Plain object
                     * @returns {spotify.login5.v3.credentials.FacebookAccessToken} FacebookAccessToken
                     */
                    FacebookAccessToken.fromObject = function fromObject(object) {
                        if (object instanceof $root.spotify.login5.v3.credentials.FacebookAccessToken)
                            return object;
                        var message = new $root.spotify.login5.v3.credentials.FacebookAccessToken();
                        if (object.fbUid != null)
                            message.fbUid = String(object.fbUid);
                        if (object.accessToken != null)
                            message.accessToken = String(object.accessToken);
                        return message;
                    };

                    /**
                     * Creates a plain object from a FacebookAccessToken message. Also converts values to other types if specified.
                     * @function toObject
                     * @memberof spotify.login5.v3.credentials.FacebookAccessToken
                     * @static
                     * @param {spotify.login5.v3.credentials.FacebookAccessToken} message FacebookAccessToken
                     * @param {$protobuf.IConversionOptions} [options] Conversion options
                     * @returns {Object.<string,*>} Plain object
                     */
                    FacebookAccessToken.toObject = function toObject(message, options) {
                        if (!options)
                            options = {};
                        var object = {};
                        if (options.defaults) {
                            object.fbUid = "";
                            object.accessToken = "";
                        }
                        if (message.fbUid != null && message.hasOwnProperty("fbUid"))
                            object.fbUid = message.fbUid;
                        if (message.accessToken != null && message.hasOwnProperty("accessToken"))
                            object.accessToken = message.accessToken;
                        return object;
                    };

                    /**
                     * Converts this FacebookAccessToken to JSON.
                     * @function toJSON
                     * @memberof spotify.login5.v3.credentials.FacebookAccessToken
                     * @instance
                     * @returns {Object.<string,*>} JSON object
                     */
                    FacebookAccessToken.prototype.toJSON = function toJSON() {
                        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                    };

                    /**
                     * Gets the default type url for FacebookAccessToken
                     * @function getTypeUrl
                     * @memberof spotify.login5.v3.credentials.FacebookAccessToken
                     * @static
                     * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                     * @returns {string} The default type url
                     */
                    FacebookAccessToken.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                        if (typeUrlPrefix === undefined) {
                            typeUrlPrefix = "type.googleapis.com";
                        }
                        return typeUrlPrefix + "/spotify.login5.v3.credentials.FacebookAccessToken";
                    };

                    return FacebookAccessToken;
                })();

                credentials.OneTimeToken = (function() {

                    /**
                     * Properties of an OneTimeToken.
                     * @memberof spotify.login5.v3.credentials
                     * @interface IOneTimeToken
                     * @property {string|null} [token] OneTimeToken token
                     */

                    /**
                     * Constructs a new OneTimeToken.
                     * @memberof spotify.login5.v3.credentials
                     * @classdesc Represents an OneTimeToken.
                     * @implements IOneTimeToken
                     * @constructor
                     * @param {spotify.login5.v3.credentials.IOneTimeToken=} [properties] Properties to set
                     */
                    function OneTimeToken(properties) {
                        if (properties)
                            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null)
                                    this[keys[i]] = properties[keys[i]];
                    }

                    /**
                     * OneTimeToken token.
                     * @member {string} token
                     * @memberof spotify.login5.v3.credentials.OneTimeToken
                     * @instance
                     */
                    OneTimeToken.prototype.token = "";

                    /**
                     * Creates a new OneTimeToken instance using the specified properties.
                     * @function create
                     * @memberof spotify.login5.v3.credentials.OneTimeToken
                     * @static
                     * @param {spotify.login5.v3.credentials.IOneTimeToken=} [properties] Properties to set
                     * @returns {spotify.login5.v3.credentials.OneTimeToken} OneTimeToken instance
                     */
                    OneTimeToken.create = function create(properties) {
                        return new OneTimeToken(properties);
                    };

                    /**
                     * Encodes the specified OneTimeToken message. Does not implicitly {@link spotify.login5.v3.credentials.OneTimeToken.verify|verify} messages.
                     * @function encode
                     * @memberof spotify.login5.v3.credentials.OneTimeToken
                     * @static
                     * @param {spotify.login5.v3.credentials.IOneTimeToken} message OneTimeToken message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    OneTimeToken.encode = function encode(message, writer) {
                        if (!writer)
                            writer = $Writer.create();
                        if (message.token != null && Object.hasOwnProperty.call(message, "token"))
                            writer.uint32(/* id 1, wireType 2 =*/10).string(message.token);
                        return writer;
                    };

                    /**
                     * Encodes the specified OneTimeToken message, length delimited. Does not implicitly {@link spotify.login5.v3.credentials.OneTimeToken.verify|verify} messages.
                     * @function encodeDelimited
                     * @memberof spotify.login5.v3.credentials.OneTimeToken
                     * @static
                     * @param {spotify.login5.v3.credentials.IOneTimeToken} message OneTimeToken message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    OneTimeToken.encodeDelimited = function encodeDelimited(message, writer) {
                        return this.encode(message, writer).ldelim();
                    };

                    /**
                     * Decodes an OneTimeToken message from the specified reader or buffer.
                     * @function decode
                     * @memberof spotify.login5.v3.credentials.OneTimeToken
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @param {number} [length] Message length if known beforehand
                     * @returns {spotify.login5.v3.credentials.OneTimeToken} OneTimeToken
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    OneTimeToken.decode = function decode(reader, length) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.credentials.OneTimeToken();
                        while (reader.pos < end) {
                            var tag = reader.uint32();
                            switch (tag >>> 3) {
                            case 1: {
                                    message.token = reader.string();
                                    break;
                                }
                            default:
                                reader.skipType(tag & 7);
                                break;
                            }
                        }
                        return message;
                    };

                    /**
                     * Decodes an OneTimeToken message from the specified reader or buffer, length delimited.
                     * @function decodeDelimited
                     * @memberof spotify.login5.v3.credentials.OneTimeToken
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @returns {spotify.login5.v3.credentials.OneTimeToken} OneTimeToken
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    OneTimeToken.decodeDelimited = function decodeDelimited(reader) {
                        if (!(reader instanceof $Reader))
                            reader = new $Reader(reader);
                        return this.decode(reader, reader.uint32());
                    };

                    /**
                     * Verifies an OneTimeToken message.
                     * @function verify
                     * @memberof spotify.login5.v3.credentials.OneTimeToken
                     * @static
                     * @param {Object.<string,*>} message Plain object to verify
                     * @returns {string|null} `null` if valid, otherwise the reason why it is not
                     */
                    OneTimeToken.verify = function verify(message) {
                        if (typeof message !== "object" || message === null)
                            return "object expected";
                        if (message.token != null && message.hasOwnProperty("token"))
                            if (!$util.isString(message.token))
                                return "token: string expected";
                        return null;
                    };

                    /**
                     * Creates an OneTimeToken message from a plain object. Also converts values to their respective internal types.
                     * @function fromObject
                     * @memberof spotify.login5.v3.credentials.OneTimeToken
                     * @static
                     * @param {Object.<string,*>} object Plain object
                     * @returns {spotify.login5.v3.credentials.OneTimeToken} OneTimeToken
                     */
                    OneTimeToken.fromObject = function fromObject(object) {
                        if (object instanceof $root.spotify.login5.v3.credentials.OneTimeToken)
                            return object;
                        var message = new $root.spotify.login5.v3.credentials.OneTimeToken();
                        if (object.token != null)
                            message.token = String(object.token);
                        return message;
                    };

                    /**
                     * Creates a plain object from an OneTimeToken message. Also converts values to other types if specified.
                     * @function toObject
                     * @memberof spotify.login5.v3.credentials.OneTimeToken
                     * @static
                     * @param {spotify.login5.v3.credentials.OneTimeToken} message OneTimeToken
                     * @param {$protobuf.IConversionOptions} [options] Conversion options
                     * @returns {Object.<string,*>} Plain object
                     */
                    OneTimeToken.toObject = function toObject(message, options) {
                        if (!options)
                            options = {};
                        var object = {};
                        if (options.defaults)
                            object.token = "";
                        if (message.token != null && message.hasOwnProperty("token"))
                            object.token = message.token;
                        return object;
                    };

                    /**
                     * Converts this OneTimeToken to JSON.
                     * @function toJSON
                     * @memberof spotify.login5.v3.credentials.OneTimeToken
                     * @instance
                     * @returns {Object.<string,*>} JSON object
                     */
                    OneTimeToken.prototype.toJSON = function toJSON() {
                        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                    };

                    /**
                     * Gets the default type url for OneTimeToken
                     * @function getTypeUrl
                     * @memberof spotify.login5.v3.credentials.OneTimeToken
                     * @static
                     * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                     * @returns {string} The default type url
                     */
                    OneTimeToken.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                        if (typeUrlPrefix === undefined) {
                            typeUrlPrefix = "type.googleapis.com";
                        }
                        return typeUrlPrefix + "/spotify.login5.v3.credentials.OneTimeToken";
                    };

                    return OneTimeToken;
                })();

                credentials.ParentChildCredential = (function() {

                    /**
                     * Properties of a ParentChildCredential.
                     * @memberof spotify.login5.v3.credentials
                     * @interface IParentChildCredential
                     * @property {string|null} [childId] ParentChildCredential childId
                     * @property {spotify.login5.v3.credentials.IStoredCredential|null} [parentStoredCredential] ParentChildCredential parentStoredCredential
                     */

                    /**
                     * Constructs a new ParentChildCredential.
                     * @memberof spotify.login5.v3.credentials
                     * @classdesc Represents a ParentChildCredential.
                     * @implements IParentChildCredential
                     * @constructor
                     * @param {spotify.login5.v3.credentials.IParentChildCredential=} [properties] Properties to set
                     */
                    function ParentChildCredential(properties) {
                        if (properties)
                            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null)
                                    this[keys[i]] = properties[keys[i]];
                    }

                    /**
                     * ParentChildCredential childId.
                     * @member {string} childId
                     * @memberof spotify.login5.v3.credentials.ParentChildCredential
                     * @instance
                     */
                    ParentChildCredential.prototype.childId = "";

                    /**
                     * ParentChildCredential parentStoredCredential.
                     * @member {spotify.login5.v3.credentials.IStoredCredential|null|undefined} parentStoredCredential
                     * @memberof spotify.login5.v3.credentials.ParentChildCredential
                     * @instance
                     */
                    ParentChildCredential.prototype.parentStoredCredential = null;

                    /**
                     * Creates a new ParentChildCredential instance using the specified properties.
                     * @function create
                     * @memberof spotify.login5.v3.credentials.ParentChildCredential
                     * @static
                     * @param {spotify.login5.v3.credentials.IParentChildCredential=} [properties] Properties to set
                     * @returns {spotify.login5.v3.credentials.ParentChildCredential} ParentChildCredential instance
                     */
                    ParentChildCredential.create = function create(properties) {
                        return new ParentChildCredential(properties);
                    };

                    /**
                     * Encodes the specified ParentChildCredential message. Does not implicitly {@link spotify.login5.v3.credentials.ParentChildCredential.verify|verify} messages.
                     * @function encode
                     * @memberof spotify.login5.v3.credentials.ParentChildCredential
                     * @static
                     * @param {spotify.login5.v3.credentials.IParentChildCredential} message ParentChildCredential message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    ParentChildCredential.encode = function encode(message, writer) {
                        if (!writer)
                            writer = $Writer.create();
                        if (message.childId != null && Object.hasOwnProperty.call(message, "childId"))
                            writer.uint32(/* id 1, wireType 2 =*/10).string(message.childId);
                        if (message.parentStoredCredential != null && Object.hasOwnProperty.call(message, "parentStoredCredential"))
                            $root.spotify.login5.v3.credentials.StoredCredential.encode(message.parentStoredCredential, writer.uint32(/* id 2, wireType 2 =*/18).fork()).ldelim();
                        return writer;
                    };

                    /**
                     * Encodes the specified ParentChildCredential message, length delimited. Does not implicitly {@link spotify.login5.v3.credentials.ParentChildCredential.verify|verify} messages.
                     * @function encodeDelimited
                     * @memberof spotify.login5.v3.credentials.ParentChildCredential
                     * @static
                     * @param {spotify.login5.v3.credentials.IParentChildCredential} message ParentChildCredential message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    ParentChildCredential.encodeDelimited = function encodeDelimited(message, writer) {
                        return this.encode(message, writer).ldelim();
                    };

                    /**
                     * Decodes a ParentChildCredential message from the specified reader or buffer.
                     * @function decode
                     * @memberof spotify.login5.v3.credentials.ParentChildCredential
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @param {number} [length] Message length if known beforehand
                     * @returns {spotify.login5.v3.credentials.ParentChildCredential} ParentChildCredential
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    ParentChildCredential.decode = function decode(reader, length) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.credentials.ParentChildCredential();
                        while (reader.pos < end) {
                            var tag = reader.uint32();
                            switch (tag >>> 3) {
                            case 1: {
                                    message.childId = reader.string();
                                    break;
                                }
                            case 2: {
                                    message.parentStoredCredential = $root.spotify.login5.v3.credentials.StoredCredential.decode(reader, reader.uint32());
                                    break;
                                }
                            default:
                                reader.skipType(tag & 7);
                                break;
                            }
                        }
                        return message;
                    };

                    /**
                     * Decodes a ParentChildCredential message from the specified reader or buffer, length delimited.
                     * @function decodeDelimited
                     * @memberof spotify.login5.v3.credentials.ParentChildCredential
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @returns {spotify.login5.v3.credentials.ParentChildCredential} ParentChildCredential
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    ParentChildCredential.decodeDelimited = function decodeDelimited(reader) {
                        if (!(reader instanceof $Reader))
                            reader = new $Reader(reader);
                        return this.decode(reader, reader.uint32());
                    };

                    /**
                     * Verifies a ParentChildCredential message.
                     * @function verify
                     * @memberof spotify.login5.v3.credentials.ParentChildCredential
                     * @static
                     * @param {Object.<string,*>} message Plain object to verify
                     * @returns {string|null} `null` if valid, otherwise the reason why it is not
                     */
                    ParentChildCredential.verify = function verify(message) {
                        if (typeof message !== "object" || message === null)
                            return "object expected";
                        if (message.childId != null && message.hasOwnProperty("childId"))
                            if (!$util.isString(message.childId))
                                return "childId: string expected";
                        if (message.parentStoredCredential != null && message.hasOwnProperty("parentStoredCredential")) {
                            var error = $root.spotify.login5.v3.credentials.StoredCredential.verify(message.parentStoredCredential);
                            if (error)
                                return "parentStoredCredential." + error;
                        }
                        return null;
                    };

                    /**
                     * Creates a ParentChildCredential message from a plain object. Also converts values to their respective internal types.
                     * @function fromObject
                     * @memberof spotify.login5.v3.credentials.ParentChildCredential
                     * @static
                     * @param {Object.<string,*>} object Plain object
                     * @returns {spotify.login5.v3.credentials.ParentChildCredential} ParentChildCredential
                     */
                    ParentChildCredential.fromObject = function fromObject(object) {
                        if (object instanceof $root.spotify.login5.v3.credentials.ParentChildCredential)
                            return object;
                        var message = new $root.spotify.login5.v3.credentials.ParentChildCredential();
                        if (object.childId != null)
                            message.childId = String(object.childId);
                        if (object.parentStoredCredential != null) {
                            if (typeof object.parentStoredCredential !== "object")
                                throw TypeError(".spotify.login5.v3.credentials.ParentChildCredential.parentStoredCredential: object expected");
                            message.parentStoredCredential = $root.spotify.login5.v3.credentials.StoredCredential.fromObject(object.parentStoredCredential);
                        }
                        return message;
                    };

                    /**
                     * Creates a plain object from a ParentChildCredential message. Also converts values to other types if specified.
                     * @function toObject
                     * @memberof spotify.login5.v3.credentials.ParentChildCredential
                     * @static
                     * @param {spotify.login5.v3.credentials.ParentChildCredential} message ParentChildCredential
                     * @param {$protobuf.IConversionOptions} [options] Conversion options
                     * @returns {Object.<string,*>} Plain object
                     */
                    ParentChildCredential.toObject = function toObject(message, options) {
                        if (!options)
                            options = {};
                        var object = {};
                        if (options.defaults) {
                            object.childId = "";
                            object.parentStoredCredential = null;
                        }
                        if (message.childId != null && message.hasOwnProperty("childId"))
                            object.childId = message.childId;
                        if (message.parentStoredCredential != null && message.hasOwnProperty("parentStoredCredential"))
                            object.parentStoredCredential = $root.spotify.login5.v3.credentials.StoredCredential.toObject(message.parentStoredCredential, options);
                        return object;
                    };

                    /**
                     * Converts this ParentChildCredential to JSON.
                     * @function toJSON
                     * @memberof spotify.login5.v3.credentials.ParentChildCredential
                     * @instance
                     * @returns {Object.<string,*>} JSON object
                     */
                    ParentChildCredential.prototype.toJSON = function toJSON() {
                        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                    };

                    /**
                     * Gets the default type url for ParentChildCredential
                     * @function getTypeUrl
                     * @memberof spotify.login5.v3.credentials.ParentChildCredential
                     * @static
                     * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                     * @returns {string} The default type url
                     */
                    ParentChildCredential.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                        if (typeUrlPrefix === undefined) {
                            typeUrlPrefix = "type.googleapis.com";
                        }
                        return typeUrlPrefix + "/spotify.login5.v3.credentials.ParentChildCredential";
                    };

                    return ParentChildCredential;
                })();

                credentials.AppleSignInCredential = (function() {

                    /**
                     * Properties of an AppleSignInCredential.
                     * @memberof spotify.login5.v3.credentials
                     * @interface IAppleSignInCredential
                     * @property {string|null} [authCode] AppleSignInCredential authCode
                     * @property {string|null} [redirectUri] AppleSignInCredential redirectUri
                     * @property {string|null} [bundleId] AppleSignInCredential bundleId
                     */

                    /**
                     * Constructs a new AppleSignInCredential.
                     * @memberof spotify.login5.v3.credentials
                     * @classdesc Represents an AppleSignInCredential.
                     * @implements IAppleSignInCredential
                     * @constructor
                     * @param {spotify.login5.v3.credentials.IAppleSignInCredential=} [properties] Properties to set
                     */
                    function AppleSignInCredential(properties) {
                        if (properties)
                            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null)
                                    this[keys[i]] = properties[keys[i]];
                    }

                    /**
                     * AppleSignInCredential authCode.
                     * @member {string} authCode
                     * @memberof spotify.login5.v3.credentials.AppleSignInCredential
                     * @instance
                     */
                    AppleSignInCredential.prototype.authCode = "";

                    /**
                     * AppleSignInCredential redirectUri.
                     * @member {string} redirectUri
                     * @memberof spotify.login5.v3.credentials.AppleSignInCredential
                     * @instance
                     */
                    AppleSignInCredential.prototype.redirectUri = "";

                    /**
                     * AppleSignInCredential bundleId.
                     * @member {string} bundleId
                     * @memberof spotify.login5.v3.credentials.AppleSignInCredential
                     * @instance
                     */
                    AppleSignInCredential.prototype.bundleId = "";

                    /**
                     * Creates a new AppleSignInCredential instance using the specified properties.
                     * @function create
                     * @memberof spotify.login5.v3.credentials.AppleSignInCredential
                     * @static
                     * @param {spotify.login5.v3.credentials.IAppleSignInCredential=} [properties] Properties to set
                     * @returns {spotify.login5.v3.credentials.AppleSignInCredential} AppleSignInCredential instance
                     */
                    AppleSignInCredential.create = function create(properties) {
                        return new AppleSignInCredential(properties);
                    };

                    /**
                     * Encodes the specified AppleSignInCredential message. Does not implicitly {@link spotify.login5.v3.credentials.AppleSignInCredential.verify|verify} messages.
                     * @function encode
                     * @memberof spotify.login5.v3.credentials.AppleSignInCredential
                     * @static
                     * @param {spotify.login5.v3.credentials.IAppleSignInCredential} message AppleSignInCredential message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    AppleSignInCredential.encode = function encode(message, writer) {
                        if (!writer)
                            writer = $Writer.create();
                        if (message.authCode != null && Object.hasOwnProperty.call(message, "authCode"))
                            writer.uint32(/* id 1, wireType 2 =*/10).string(message.authCode);
                        if (message.redirectUri != null && Object.hasOwnProperty.call(message, "redirectUri"))
                            writer.uint32(/* id 2, wireType 2 =*/18).string(message.redirectUri);
                        if (message.bundleId != null && Object.hasOwnProperty.call(message, "bundleId"))
                            writer.uint32(/* id 3, wireType 2 =*/26).string(message.bundleId);
                        return writer;
                    };

                    /**
                     * Encodes the specified AppleSignInCredential message, length delimited. Does not implicitly {@link spotify.login5.v3.credentials.AppleSignInCredential.verify|verify} messages.
                     * @function encodeDelimited
                     * @memberof spotify.login5.v3.credentials.AppleSignInCredential
                     * @static
                     * @param {spotify.login5.v3.credentials.IAppleSignInCredential} message AppleSignInCredential message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    AppleSignInCredential.encodeDelimited = function encodeDelimited(message, writer) {
                        return this.encode(message, writer).ldelim();
                    };

                    /**
                     * Decodes an AppleSignInCredential message from the specified reader or buffer.
                     * @function decode
                     * @memberof spotify.login5.v3.credentials.AppleSignInCredential
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @param {number} [length] Message length if known beforehand
                     * @returns {spotify.login5.v3.credentials.AppleSignInCredential} AppleSignInCredential
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    AppleSignInCredential.decode = function decode(reader, length) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.credentials.AppleSignInCredential();
                        while (reader.pos < end) {
                            var tag = reader.uint32();
                            switch (tag >>> 3) {
                            case 1: {
                                    message.authCode = reader.string();
                                    break;
                                }
                            case 2: {
                                    message.redirectUri = reader.string();
                                    break;
                                }
                            case 3: {
                                    message.bundleId = reader.string();
                                    break;
                                }
                            default:
                                reader.skipType(tag & 7);
                                break;
                            }
                        }
                        return message;
                    };

                    /**
                     * Decodes an AppleSignInCredential message from the specified reader or buffer, length delimited.
                     * @function decodeDelimited
                     * @memberof spotify.login5.v3.credentials.AppleSignInCredential
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @returns {spotify.login5.v3.credentials.AppleSignInCredential} AppleSignInCredential
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    AppleSignInCredential.decodeDelimited = function decodeDelimited(reader) {
                        if (!(reader instanceof $Reader))
                            reader = new $Reader(reader);
                        return this.decode(reader, reader.uint32());
                    };

                    /**
                     * Verifies an AppleSignInCredential message.
                     * @function verify
                     * @memberof spotify.login5.v3.credentials.AppleSignInCredential
                     * @static
                     * @param {Object.<string,*>} message Plain object to verify
                     * @returns {string|null} `null` if valid, otherwise the reason why it is not
                     */
                    AppleSignInCredential.verify = function verify(message) {
                        if (typeof message !== "object" || message === null)
                            return "object expected";
                        if (message.authCode != null && message.hasOwnProperty("authCode"))
                            if (!$util.isString(message.authCode))
                                return "authCode: string expected";
                        if (message.redirectUri != null && message.hasOwnProperty("redirectUri"))
                            if (!$util.isString(message.redirectUri))
                                return "redirectUri: string expected";
                        if (message.bundleId != null && message.hasOwnProperty("bundleId"))
                            if (!$util.isString(message.bundleId))
                                return "bundleId: string expected";
                        return null;
                    };

                    /**
                     * Creates an AppleSignInCredential message from a plain object. Also converts values to their respective internal types.
                     * @function fromObject
                     * @memberof spotify.login5.v3.credentials.AppleSignInCredential
                     * @static
                     * @param {Object.<string,*>} object Plain object
                     * @returns {spotify.login5.v3.credentials.AppleSignInCredential} AppleSignInCredential
                     */
                    AppleSignInCredential.fromObject = function fromObject(object) {
                        if (object instanceof $root.spotify.login5.v3.credentials.AppleSignInCredential)
                            return object;
                        var message = new $root.spotify.login5.v3.credentials.AppleSignInCredential();
                        if (object.authCode != null)
                            message.authCode = String(object.authCode);
                        if (object.redirectUri != null)
                            message.redirectUri = String(object.redirectUri);
                        if (object.bundleId != null)
                            message.bundleId = String(object.bundleId);
                        return message;
                    };

                    /**
                     * Creates a plain object from an AppleSignInCredential message. Also converts values to other types if specified.
                     * @function toObject
                     * @memberof spotify.login5.v3.credentials.AppleSignInCredential
                     * @static
                     * @param {spotify.login5.v3.credentials.AppleSignInCredential} message AppleSignInCredential
                     * @param {$protobuf.IConversionOptions} [options] Conversion options
                     * @returns {Object.<string,*>} Plain object
                     */
                    AppleSignInCredential.toObject = function toObject(message, options) {
                        if (!options)
                            options = {};
                        var object = {};
                        if (options.defaults) {
                            object.authCode = "";
                            object.redirectUri = "";
                            object.bundleId = "";
                        }
                        if (message.authCode != null && message.hasOwnProperty("authCode"))
                            object.authCode = message.authCode;
                        if (message.redirectUri != null && message.hasOwnProperty("redirectUri"))
                            object.redirectUri = message.redirectUri;
                        if (message.bundleId != null && message.hasOwnProperty("bundleId"))
                            object.bundleId = message.bundleId;
                        return object;
                    };

                    /**
                     * Converts this AppleSignInCredential to JSON.
                     * @function toJSON
                     * @memberof spotify.login5.v3.credentials.AppleSignInCredential
                     * @instance
                     * @returns {Object.<string,*>} JSON object
                     */
                    AppleSignInCredential.prototype.toJSON = function toJSON() {
                        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                    };

                    /**
                     * Gets the default type url for AppleSignInCredential
                     * @function getTypeUrl
                     * @memberof spotify.login5.v3.credentials.AppleSignInCredential
                     * @static
                     * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                     * @returns {string} The default type url
                     */
                    AppleSignInCredential.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                        if (typeUrlPrefix === undefined) {
                            typeUrlPrefix = "type.googleapis.com";
                        }
                        return typeUrlPrefix + "/spotify.login5.v3.credentials.AppleSignInCredential";
                    };

                    return AppleSignInCredential;
                })();

                return credentials;
            })();

            v3.identifiers = (function() {

                /**
                 * Namespace identifiers.
                 * @memberof spotify.login5.v3
                 * @namespace
                 */
                var identifiers = {};

                identifiers.PhoneNumber = (function() {

                    /**
                     * Properties of a PhoneNumber.
                     * @memberof spotify.login5.v3.identifiers
                     * @interface IPhoneNumber
                     * @property {string|null} [number] PhoneNumber number
                     * @property {string|null} [isoCountryCode] PhoneNumber isoCountryCode
                     * @property {string|null} [countryCallingCode] PhoneNumber countryCallingCode
                     */

                    /**
                     * Constructs a new PhoneNumber.
                     * @memberof spotify.login5.v3.identifiers
                     * @classdesc Represents a PhoneNumber.
                     * @implements IPhoneNumber
                     * @constructor
                     * @param {spotify.login5.v3.identifiers.IPhoneNumber=} [properties] Properties to set
                     */
                    function PhoneNumber(properties) {
                        if (properties)
                            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                                if (properties[keys[i]] != null)
                                    this[keys[i]] = properties[keys[i]];
                    }

                    /**
                     * PhoneNumber number.
                     * @member {string} number
                     * @memberof spotify.login5.v3.identifiers.PhoneNumber
                     * @instance
                     */
                    PhoneNumber.prototype.number = "";

                    /**
                     * PhoneNumber isoCountryCode.
                     * @member {string} isoCountryCode
                     * @memberof spotify.login5.v3.identifiers.PhoneNumber
                     * @instance
                     */
                    PhoneNumber.prototype.isoCountryCode = "";

                    /**
                     * PhoneNumber countryCallingCode.
                     * @member {string} countryCallingCode
                     * @memberof spotify.login5.v3.identifiers.PhoneNumber
                     * @instance
                     */
                    PhoneNumber.prototype.countryCallingCode = "";

                    /**
                     * Creates a new PhoneNumber instance using the specified properties.
                     * @function create
                     * @memberof spotify.login5.v3.identifiers.PhoneNumber
                     * @static
                     * @param {spotify.login5.v3.identifiers.IPhoneNumber=} [properties] Properties to set
                     * @returns {spotify.login5.v3.identifiers.PhoneNumber} PhoneNumber instance
                     */
                    PhoneNumber.create = function create(properties) {
                        return new PhoneNumber(properties);
                    };

                    /**
                     * Encodes the specified PhoneNumber message. Does not implicitly {@link spotify.login5.v3.identifiers.PhoneNumber.verify|verify} messages.
                     * @function encode
                     * @memberof spotify.login5.v3.identifiers.PhoneNumber
                     * @static
                     * @param {spotify.login5.v3.identifiers.IPhoneNumber} message PhoneNumber message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    PhoneNumber.encode = function encode(message, writer) {
                        if (!writer)
                            writer = $Writer.create();
                        if (message.number != null && Object.hasOwnProperty.call(message, "number"))
                            writer.uint32(/* id 1, wireType 2 =*/10).string(message.number);
                        if (message.isoCountryCode != null && Object.hasOwnProperty.call(message, "isoCountryCode"))
                            writer.uint32(/* id 2, wireType 2 =*/18).string(message.isoCountryCode);
                        if (message.countryCallingCode != null && Object.hasOwnProperty.call(message, "countryCallingCode"))
                            writer.uint32(/* id 3, wireType 2 =*/26).string(message.countryCallingCode);
                        return writer;
                    };

                    /**
                     * Encodes the specified PhoneNumber message, length delimited. Does not implicitly {@link spotify.login5.v3.identifiers.PhoneNumber.verify|verify} messages.
                     * @function encodeDelimited
                     * @memberof spotify.login5.v3.identifiers.PhoneNumber
                     * @static
                     * @param {spotify.login5.v3.identifiers.IPhoneNumber} message PhoneNumber message or plain object to encode
                     * @param {$protobuf.Writer} [writer] Writer to encode to
                     * @returns {$protobuf.Writer} Writer
                     */
                    PhoneNumber.encodeDelimited = function encodeDelimited(message, writer) {
                        return this.encode(message, writer).ldelim();
                    };

                    /**
                     * Decodes a PhoneNumber message from the specified reader or buffer.
                     * @function decode
                     * @memberof spotify.login5.v3.identifiers.PhoneNumber
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @param {number} [length] Message length if known beforehand
                     * @returns {spotify.login5.v3.identifiers.PhoneNumber} PhoneNumber
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    PhoneNumber.decode = function decode(reader, length) {
                        if (!(reader instanceof $Reader))
                            reader = $Reader.create(reader);
                        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.spotify.login5.v3.identifiers.PhoneNumber();
                        while (reader.pos < end) {
                            var tag = reader.uint32();
                            switch (tag >>> 3) {
                            case 1: {
                                    message.number = reader.string();
                                    break;
                                }
                            case 2: {
                                    message.isoCountryCode = reader.string();
                                    break;
                                }
                            case 3: {
                                    message.countryCallingCode = reader.string();
                                    break;
                                }
                            default:
                                reader.skipType(tag & 7);
                                break;
                            }
                        }
                        return message;
                    };

                    /**
                     * Decodes a PhoneNumber message from the specified reader or buffer, length delimited.
                     * @function decodeDelimited
                     * @memberof spotify.login5.v3.identifiers.PhoneNumber
                     * @static
                     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
                     * @returns {spotify.login5.v3.identifiers.PhoneNumber} PhoneNumber
                     * @throws {Error} If the payload is not a reader or valid buffer
                     * @throws {$protobuf.util.ProtocolError} If required fields are missing
                     */
                    PhoneNumber.decodeDelimited = function decodeDelimited(reader) {
                        if (!(reader instanceof $Reader))
                            reader = new $Reader(reader);
                        return this.decode(reader, reader.uint32());
                    };

                    /**
                     * Verifies a PhoneNumber message.
                     * @function verify
                     * @memberof spotify.login5.v3.identifiers.PhoneNumber
                     * @static
                     * @param {Object.<string,*>} message Plain object to verify
                     * @returns {string|null} `null` if valid, otherwise the reason why it is not
                     */
                    PhoneNumber.verify = function verify(message) {
                        if (typeof message !== "object" || message === null)
                            return "object expected";
                        if (message.number != null && message.hasOwnProperty("number"))
                            if (!$util.isString(message.number))
                                return "number: string expected";
                        if (message.isoCountryCode != null && message.hasOwnProperty("isoCountryCode"))
                            if (!$util.isString(message.isoCountryCode))
                                return "isoCountryCode: string expected";
                        if (message.countryCallingCode != null && message.hasOwnProperty("countryCallingCode"))
                            if (!$util.isString(message.countryCallingCode))
                                return "countryCallingCode: string expected";
                        return null;
                    };

                    /**
                     * Creates a PhoneNumber message from a plain object. Also converts values to their respective internal types.
                     * @function fromObject
                     * @memberof spotify.login5.v3.identifiers.PhoneNumber
                     * @static
                     * @param {Object.<string,*>} object Plain object
                     * @returns {spotify.login5.v3.identifiers.PhoneNumber} PhoneNumber
                     */
                    PhoneNumber.fromObject = function fromObject(object) {
                        if (object instanceof $root.spotify.login5.v3.identifiers.PhoneNumber)
                            return object;
                        var message = new $root.spotify.login5.v3.identifiers.PhoneNumber();
                        if (object.number != null)
                            message.number = String(object.number);
                        if (object.isoCountryCode != null)
                            message.isoCountryCode = String(object.isoCountryCode);
                        if (object.countryCallingCode != null)
                            message.countryCallingCode = String(object.countryCallingCode);
                        return message;
                    };

                    /**
                     * Creates a plain object from a PhoneNumber message. Also converts values to other types if specified.
                     * @function toObject
                     * @memberof spotify.login5.v3.identifiers.PhoneNumber
                     * @static
                     * @param {spotify.login5.v3.identifiers.PhoneNumber} message PhoneNumber
                     * @param {$protobuf.IConversionOptions} [options] Conversion options
                     * @returns {Object.<string,*>} Plain object
                     */
                    PhoneNumber.toObject = function toObject(message, options) {
                        if (!options)
                            options = {};
                        var object = {};
                        if (options.defaults) {
                            object.number = "";
                            object.isoCountryCode = "";
                            object.countryCallingCode = "";
                        }
                        if (message.number != null && message.hasOwnProperty("number"))
                            object.number = message.number;
                        if (message.isoCountryCode != null && message.hasOwnProperty("isoCountryCode"))
                            object.isoCountryCode = message.isoCountryCode;
                        if (message.countryCallingCode != null && message.hasOwnProperty("countryCallingCode"))
                            object.countryCallingCode = message.countryCallingCode;
                        return object;
                    };

                    /**
                     * Converts this PhoneNumber to JSON.
                     * @function toJSON
                     * @memberof spotify.login5.v3.identifiers.PhoneNumber
                     * @instance
                     * @returns {Object.<string,*>} JSON object
                     */
                    PhoneNumber.prototype.toJSON = function toJSON() {
                        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
                    };

                    /**
                     * Gets the default type url for PhoneNumber
                     * @function getTypeUrl
                     * @memberof spotify.login5.v3.identifiers.PhoneNumber
                     * @static
                     * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
                     * @returns {string} The default type url
                     */
                    PhoneNumber.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                        if (typeUrlPrefix === undefined) {
                            typeUrlPrefix = "type.googleapis.com";
                        }
                        return typeUrlPrefix + "/spotify.login5.v3.identifiers.PhoneNumber";
                    };

                    return PhoneNumber;
                })();

                return identifiers;
            })();

            return v3;
        })();

        return login5;
    })();

    return spotify;
})();

$root.google = (function() {

    /**
     * Namespace google.
     * @exports google
     * @namespace
     */
    var google = {};

    google.protobuf = (function() {

        /**
         * Namespace protobuf.
         * @memberof google
         * @namespace
         */
        var protobuf = {};

        protobuf.Duration = (function() {

            /**
             * Properties of a Duration.
             * @memberof google.protobuf
             * @interface IDuration
             * @property {number|Long|null} [seconds] Duration seconds
             * @property {number|null} [nanos] Duration nanos
             */

            /**
             * Constructs a new Duration.
             * @memberof google.protobuf
             * @classdesc Represents a Duration.
             * @implements IDuration
             * @constructor
             * @param {google.protobuf.IDuration=} [properties] Properties to set
             */
            function Duration(properties) {
                if (properties)
                    for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                        if (properties[keys[i]] != null)
                            this[keys[i]] = properties[keys[i]];
            }

            /**
             * Duration seconds.
             * @member {number|Long} seconds
             * @memberof google.protobuf.Duration
             * @instance
             */
            Duration.prototype.seconds = $util.Long ? $util.Long.fromBits(0,0,false) : 0;

            /**
             * Duration nanos.
             * @member {number} nanos
             * @memberof google.protobuf.Duration
             * @instance
             */
            Duration.prototype.nanos = 0;

            /**
             * Creates a new Duration instance using the specified properties.
             * @function create
             * @memberof google.protobuf.Duration
             * @static
             * @param {google.protobuf.IDuration=} [properties] Properties to set
             * @returns {google.protobuf.Duration} Duration instance
             */
            Duration.create = function create(properties) {
                return new Duration(properties);
            };

            /**
             * Encodes the specified Duration message. Does not implicitly {@link google.protobuf.Duration.verify|verify} messages.
             * @function encode
             * @memberof google.protobuf.Duration
             * @static
             * @param {google.protobuf.IDuration} message Duration message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Duration.encode = function encode(message, writer) {
                if (!writer)
                    writer = $Writer.create();
                if (message.seconds != null && Object.hasOwnProperty.call(message, "seconds"))
                    writer.uint32(/* id 1, wireType 0 =*/8).int64(message.seconds);
                if (message.nanos != null && Object.hasOwnProperty.call(message, "nanos"))
                    writer.uint32(/* id 2, wireType 0 =*/16).int32(message.nanos);
                return writer;
            };

            /**
             * Encodes the specified Duration message, length delimited. Does not implicitly {@link google.protobuf.Duration.verify|verify} messages.
             * @function encodeDelimited
             * @memberof google.protobuf.Duration
             * @static
             * @param {google.protobuf.IDuration} message Duration message or plain object to encode
             * @param {$protobuf.Writer} [writer] Writer to encode to
             * @returns {$protobuf.Writer} Writer
             */
            Duration.encodeDelimited = function encodeDelimited(message, writer) {
                return this.encode(message, writer).ldelim();
            };

            /**
             * Decodes a Duration message from the specified reader or buffer.
             * @function decode
             * @memberof google.protobuf.Duration
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @param {number} [length] Message length if known beforehand
             * @returns {google.protobuf.Duration} Duration
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Duration.decode = function decode(reader, length) {
                if (!(reader instanceof $Reader))
                    reader = $Reader.create(reader);
                var end = length === undefined ? reader.len : reader.pos + length, message = new $root.google.protobuf.Duration();
                while (reader.pos < end) {
                    var tag = reader.uint32();
                    switch (tag >>> 3) {
                    case 1: {
                            message.seconds = reader.int64();
                            break;
                        }
                    case 2: {
                            message.nanos = reader.int32();
                            break;
                        }
                    default:
                        reader.skipType(tag & 7);
                        break;
                    }
                }
                return message;
            };

            /**
             * Decodes a Duration message from the specified reader or buffer, length delimited.
             * @function decodeDelimited
             * @memberof google.protobuf.Duration
             * @static
             * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
             * @returns {google.protobuf.Duration} Duration
             * @throws {Error} If the payload is not a reader or valid buffer
             * @throws {$protobuf.util.ProtocolError} If required fields are missing
             */
            Duration.decodeDelimited = function decodeDelimited(reader) {
                if (!(reader instanceof $Reader))
                    reader = new $Reader(reader);
                return this.decode(reader, reader.uint32());
            };

            /**
             * Verifies a Duration message.
             * @function verify
             * @memberof google.protobuf.Duration
             * @static
             * @param {Object.<string,*>} message Plain object to verify
             * @returns {string|null} `null` if valid, otherwise the reason why it is not
             */
            Duration.verify = function verify(message) {
                if (typeof message !== "object" || message === null)
                    return "object expected";
                if (message.seconds != null && message.hasOwnProperty("seconds"))
                    if (!$util.isInteger(message.seconds) && !(message.seconds && $util.isInteger(message.seconds.low) && $util.isInteger(message.seconds.high)))
                        return "seconds: integer|Long expected";
                if (message.nanos != null && message.hasOwnProperty("nanos"))
                    if (!$util.isInteger(message.nanos))
                        return "nanos: integer expected";
                return null;
            };

            /**
             * Creates a Duration message from a plain object. Also converts values to their respective internal types.
             * @function fromObject
             * @memberof google.protobuf.Duration
             * @static
             * @param {Object.<string,*>} object Plain object
             * @returns {google.protobuf.Duration} Duration
             */
            Duration.fromObject = function fromObject(object) {
                if (object instanceof $root.google.protobuf.Duration)
                    return object;
                var message = new $root.google.protobuf.Duration();
                if (object.seconds != null)
                    if ($util.Long)
                        (message.seconds = $util.Long.fromValue(object.seconds)).unsigned = false;
                    else if (typeof object.seconds === "string")
                        message.seconds = parseInt(object.seconds, 10);
                    else if (typeof object.seconds === "number")
                        message.seconds = object.seconds;
                    else if (typeof object.seconds === "object")
                        message.seconds = new $util.LongBits(object.seconds.low >>> 0, object.seconds.high >>> 0).toNumber();
                if (object.nanos != null)
                    message.nanos = object.nanos | 0;
                return message;
            };

            /**
             * Creates a plain object from a Duration message. Also converts values to other types if specified.
             * @function toObject
             * @memberof google.protobuf.Duration
             * @static
             * @param {google.protobuf.Duration} message Duration
             * @param {$protobuf.IConversionOptions} [options] Conversion options
             * @returns {Object.<string,*>} Plain object
             */
            Duration.toObject = function toObject(message, options) {
                if (!options)
                    options = {};
                var object = {};
                if (options.defaults) {
                    if ($util.Long) {
                        var long = new $util.Long(0, 0, false);
                        object.seconds = options.longs === String ? long.toString() : options.longs === Number ? long.toNumber() : long;
                    } else
                        object.seconds = options.longs === String ? "0" : 0;
                    object.nanos = 0;
                }
                if (message.seconds != null && message.hasOwnProperty("seconds"))
                    if (typeof message.seconds === "number")
                        object.seconds = options.longs === String ? String(message.seconds) : message.seconds;
                    else
                        object.seconds = options.longs === String ? $util.Long.prototype.toString.call(message.seconds) : options.longs === Number ? new $util.LongBits(message.seconds.low >>> 0, message.seconds.high >>> 0).toNumber() : message.seconds;
                if (message.nanos != null && message.hasOwnProperty("nanos"))
                    object.nanos = message.nanos;
                return object;
            };

            /**
             * Converts this Duration to JSON.
             * @function toJSON
             * @memberof google.protobuf.Duration
             * @instance
             * @returns {Object.<string,*>} JSON object
             */
            Duration.prototype.toJSON = function toJSON() {
                return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
            };

            /**
             * Gets the default type url for Duration
             * @function getTypeUrl
             * @memberof google.protobuf.Duration
             * @static
             * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
             * @returns {string} The default type url
             */
            Duration.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
                if (typeUrlPrefix === undefined) {
                    typeUrlPrefix = "type.googleapis.com";
                }
                return typeUrlPrefix + "/google.protobuf.Duration";
            };

            return Duration;
        })();

        return protobuf;
    })();

    return google;
})();

module.exports = $root;
