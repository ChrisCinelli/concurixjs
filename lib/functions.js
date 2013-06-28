// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.
//
// Maintain information about functions in the program being traced.
// Initially, the information consists of contexts for function declarations
// and function expressions that may lead to clearer labels for anonymous
// functions.

'use strict';

var fs = require('fs');
var esprima = require('esprima');
var escodegen = require('escodegen');
var estraverse = require('estraverse');

module.exports = Functions;

function Functions(options) {}

// The module maintains a table of function information.
// Table keys are strings consisting of (source code file name + ':' + line number) where
// function declarations and expressions appear.
// Table values are lists of objects describing the declaration or expression and the
// context in which it appeared in the source code.
// Those objects have a 'type' property denoting an AST node type and a set of properties
// dependent on the type.
//
// Currently stored values are:
//
// For normal function declarations:
// {
//   type : esprima.Syntax.FunctionDeclaration,
//   name : declared function name
//   empty: true iff the function body is empty
// }
//
// For function expressions
// {
//   type : esprima.Syntax.FunctionExpression,
//   name : declared function name [optional]
//   empty: true iff the function body is empty
//   context: context of the function expression, as described below [optional]
// } 
//
// Function contexts are represented by objects with a 'kind' property that
// is an AST node type and a set of properties dependent on the kind.  The kinds
// of contexts that we currently recognize are:
//
// Functions assigned to variables or properties, e.g.
//   foo.prototype.bar = function ...
// represented as:
// {
//   kind : esprima.Syntax.AssignmentExpression,
//   lhs  : left-hand side of the assignment as a string (e.g. 'foo.prototype.bar')
// }
//
// Functions used as variable initializers, e.g.
//   var foo = function ...
// represented as:
// {
//   kind : esprima.Syntax.VariableDeclarator,
//   variable : variable name as a string (e.g. 'foo')
// }
//
// Functions used as property initializers, e.g.
//   { get: function ..., set: function ...}
// represented as:
// {
//   kind : esprima.Syntax.Property,
//   key  : property key as a string (e.g. 'get' or 'set')
// }
//
// Functions returned from functions, e.g.
//    return function ...;
// represented as:
// {
//   kind : esprima.Syntax.Return
// }
//
// Functions appearing in call expressions, either as a callee or as
// an argument, e.g.
//    1) function () {return 3;}()
//    2) a.foo(function ...)
//    3) a.on('open', function ...)
// represented as:
// {
//    kind : esprima.Syntax.CallExpression,
//    is_immediately_called : true iff the function is the callee, as in example 1
//    is_handler : true iff the function name is 'on', as in example 3
//    event_handled : if is_handler is true and the first argument to the call
//                    is a literal string, then event_handled is that string [optional]
//    call_expr : callee expression as a string, so in our examples it would be
//                1) 'function () {return 3;}'
//                2) 'a.foo'
//                3) 'a.on'
// }
//

var table = {};

// Parse the given file and add discovered functions to the table.
var parser_options = {
    loc: true,
    range: true
};

// Exported functions

// Set of filenames already parsed.
var parsed = {};

// Parse one file and add its functions to the table.
Functions.parse = function parse(fname) {
    if (!parsed[fname]) {
        fs.readFile(fname, function(err, data){
            if (!err) {
                var ast = esprima.parse(data.toString(), parser_options);
                estraverse.traverse(ast, process_functions);
            }
        });
        parsed[fname] = true;
    }
}

// Lookup functions at a particular filename and line number.
Functions.lookup = function lookup(fname, line) {
    var key = table_key(fname, line);
    return table[key];
}


// Internal logic

// Map file name and line number to table key.
function table_key(fname, line) {
    return fname + ':' + line;
}

// Apply a heuristic to find functions that associate a handler with
// an event.
function is_event_func(tree) {
    switch (tree.type) {
    case esprima.Syntax.Identifier:
        return tree.name == 'on' ||
            tree.name == 'once' ||
            tree.name == 'addListener';
    case esprima.Syntax.MemberExpression:
        if (!tree.computed) {
            return is_event_func(tree.property);
        }
        return false;
    default:
        return false;
    }
}

// Look for an informative context in the list of parent nodes (a
// path from the root AST node down to the parent of the current node).
function get_context(node, path) {
    if (path.length > 1) {
        var parent = path[path.length - 1];
        switch (parent.type) {
        case esprima.Syntax.AssignmentExpression:
            return {
                kind : parent.type,
                lhs : escodegen.generate(parent.left)
            };
        case esprima.Syntax.VariableDeclarator:
            return {
                kind : parent.type,
                variable : escodegen.generate(parent.id)
            };
        case esprima.Syntax.Property:
            if (parent.value === node) {
                return {
                    kind : parent.type,
                    key : escodegen.generate(parent.key)
                };
            }
            return undefined;
        case esprima.Syntax.ReturnStatement:
            if (parent.argument) {
                return {
                    kind : parent.type
                };
            }
            return undefined;
        case esprima.Syntax.CallExpression:
            var call_expr = escodegen.generate(parent.callee);
            var is_handler = is_event_func(parent.callee);
            var event_handled = undefined;
            if (is_handler) {
                if (parent.arguments.length > 0) {
                    var arg0 = parent.arguments[0];
                    if (arg0.type == esprima.Syntax.Literal &&
                        typeof arg0.value == 'string') {
                        event_handled = arg0.value;
                    }
                }
            }
            return {
                kind : parent.type,
                is_immediately_called : parent.callee === node,
                is_handler : is_handler,
                event_handled : event_handled,
                call_expr : call_expr
            };
        default:
            return undefined;
        }
    }
    return undefined;
}


// An object for AST traversal that finds function declarations and
// function expressions and stores descriptions of them into the
// lookup table.
var process_functions = {
    enter: function (node) {
        var context;
        var key;
        var value;
        var name;
        var empty;
        switch (node.type) {
        case esprima.Syntax.FunctionDeclaration:
            key = table_key(fname, node.loc.start.line);
            value = {
                type : esprima.Syntax.FunctionDeclaration,
                name : node.id.name,
                empty : node.body.length == 0,
            }

            if (table.hasOwnProperty(key)) {
                table[key].push(value);
            } else {
                table[key] = [value];
            }
            break;
        case esprima.Syntax.FunctionExpression:
            key = table_key(fname, node.loc.start.line);
            value = {
                type : esprima.Syntax.FunctionExpression,
                name : node.id ? node.id.name : undefined,
                empty : node.body.length == 0,
                context : get_context(node, this.parents())
            }

            if (table.hasOwnProperty(key)) {
                table[key].push(value);
            } else {
                table[key] = [value];
            }
            break;
        default:
            break;
        }
    },
    leave: null
};
