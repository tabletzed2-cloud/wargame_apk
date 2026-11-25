'use strict';
// Legacy function-extraction bridge. Parse JavaScript rather than counting braces
// in strings/comments/regexes. Reject duplicate globals instead of testing a
// different declaration from the one the browser executes.
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');
const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const trees = new Map();
const nestedTrees = new Map();
function declarations(source) {
    if (trees.has(source)) return trees.get(source);
    const chunks = [];
    if (/^\s*<!doctype html/i.test(source)) {
        const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
        let m;
        while ((m = re.exec(source))) chunks.push({code:m[1], offset:m.index + m[0].indexOf('>') + 1});
    } else chunks.push({code:source, offset:0});
    const found = new Map(), nested = new Map();
    for (const {code, offset} of chunks) {
        const ast = acorn.parse(code, {ecmaVersion:'latest', sourceType:'script', allowReturnOutsideFunction:true});
        function visit(node, depth) {
            if (!node || typeof node !== 'object') return;
            if (node.type === 'FunctionDeclaration' || node.type === 'VariableDeclaration') {
                const names = node.type === 'FunctionDeclaration' ? [node.id.name] :
                    node.declarations.filter(d => d.id.type === 'Identifier').map(d => d.id.name);
                for (const name of names) {
                    if (!nested.has(name)) nested.set(name, []);
                    nested.get(name).push({node, depth, start:offset + node.start, end:offset + node.end});
                }
            }
            for (const value of Object.values(node)) {
                if (Array.isArray(value)) value.forEach(child => visit(child, depth + 1));
                else if (value && typeof value === 'object') visit(value, depth + 1);
            }
        }
        visit(ast, 0);
        for (const node of ast.body) {
            if (node.type === 'FunctionDeclaration') add(node.id.name, node);
            if (node.type === 'VariableDeclaration') {
                for (const item of node.declarations) if (item.id.type === 'Identifier') add(item.id.name, node);
            }
        }
        function add(name, node) {
            if (!found.has(name)) found.set(name, []);
            found.get(name).push({node, start:offset + node.start, end:offset + node.end});
        }
    }
    trees.set(source, found);
    nestedTrees.set(source, nested);
    return found;
}
function candidates(source, name, type) {
    const top = (declarations(source).get(name) || []).filter(d => d.node.type === type);
    if (top.length) return top;
    const nested = (nestedTrees.get(source).get(name) || []).filter(d => d.node.type === type);
    const shallowest = Math.min(...nested.map(d => d.depth));
    return nested.filter(d => d.depth === shallowest);
}
function sliceFunction(source, name) {
    const found = candidates(source, name, 'FunctionDeclaration');
    if (found.length !== 1) throw new Error(`Expected one function ${name}, found ${found.length}`);
    return source.slice(found[0].start, found[0].end);
}
function sliceConst(source, name) {
    const found = candidates(source, name, 'VariableDeclaration').filter(d => d.node.kind === 'const');
    if (found.length !== 1) throw new Error(`Expected one const ${name}, found ${found.length}`);
    return source.slice(found[0].start, found[0].end);
}
module.exports = {HTML, sliceFunction, sliceConst, ROOT, declarations};
