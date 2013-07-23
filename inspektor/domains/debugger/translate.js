// Copyright Concurix Corporation 2012-2013. All Rights Reserved.
//
// The contents of this file are subject to the Concurix Terms of Service:
//
// http://www.concurix.com/main/tos_main
//
// The Software distributed under the License is distributed on an "AS IS"
// basis, WITHOUT WARRANTY OF ANY KIND, either express or implied.

var translate = exports;

var scopeTypeNames = ['global', 'local', 'with', 'closure', 'catch'];

isPrimitive = {
  "array": true,
  "date": true,
  "node": true,
  "null": true,
  "regexp": true
}

var objectTypesMap = {};

objectTypesMap['undefined'] = function(obj){
  return {
    description: obj.type,
    type: obj.type
  };
};

objectTypesMap['null'] = function(obj){
  return {
    description: obj.type,
    type: 'object',
    subtype: obj.type,
    value: null
  };
};

objectTypesMap['boolean'] = function(obj){
  return {
    description: obj.value.toString(),
    type: obj.type,
    value: obj.value
  };
};

objectTypesMap['number'] = objectTypesMap['boolean'];
objectTypesMap['string'] = objectTypesMap['boolean'];

objectTypesMap['object'] = function(obj){
  var description = obj.text.replace(/^#<(.*)>$/, '$1');
  var subtype = (description || '').toLowerCase();
  subtype = isPrimitive[subtype] ? subtype : null;
  return {
    className: obj.className,
    description: description,
    objectId: obj.handle.toString(),
    subtype: subtype,
    type: obj.type
  };
}

objectTypesMap['error'] = objectTypesMap['object'];

objectTypesMap['function'] = function(obj){
  return {
    className: obj.className,
    description: obj.text,
    objectId: obj.handle.toString(),
    type: obj.type
  };
}

function refsToHash(refs){
  var hash = {};
  refs.forEach(function(r){
    hash[r.handle] = r;
  });
  return hash;
}

translate.scripts = function scripts(scripts){
  return scripts.map(function(s){
    if (!s.name) return null; //sometimes V8 returns undefined scripts, ignore them    
    // var lastLineIdx = s.source.lastIndexOf('\n');
    // var endColumn = lastLineIdx == -1 ? s.sourceLength : s.sourceLength - lastLineIdx;
    
    var p = {
      scriptId: s.id.toString(),
      url: s.name,
      // startLine: s.lineOffset + 1,
      // startColumn: s.columnOffset,
      // endLine: s.lineCount + 1,
      // endColumn: endColumn,
      isContentScript: false,
      // sourceMapURL: null
    };
    return p;
  })
};

translate.frames = function frames(frames){
  return frames.map(function(frame){
    // var refsMap = refsToHash(frame.refs);
    var func = frame.func;
    var p = {
      callFrameId: frame.index.toString(),
      functionName: func.name || func.inferredName,
      location: {
        scriptId: func.scriptId.toString(),
        lineNumber: frame.line,
        columnNumber: frame.column
      },
      scopeChain: translate.scopes(frame.scopes)
    };
    return p;
  });
};

translate.scopes = function scopes(scopes){
  return scopes.map(function(scope){
    var refsMap = refsToHash(scope.refs);
    var obj = refsMap[scope.object.ref];
    var p = {
      // index: scope.index,
      type: scopeTypeNames[scope.type],
      object: translate.object(obj)
    };
    return p;
  });
};

translate.object = function object(object){
  var mapper = objectTypesMap[object.type];
  if (!mapper) throw "unsupported object.type = " + object.type;
  return mapper ? mapper(object) : null;
};

translate.properties = function properties(object, refs){
  var refsMap = refsToHash(refs);
  
  var propsList = object.properties;
  
  if (object.protoObject){
    object.protoObject.name = '__proto__';
    propsList.push(object.protoObject);
  }
  
  
  return propsList.map(function(prop){
    var p = {
      // configurable: false,
      // enumerable: true,
      name: prop.name,
      value: translate.object(refsMap[prop.ref])
    }
    return p;
  });
};

translate.func = function func(object, refs){
  var refsMap = refsToHash(refs);
  
  var location = {
    scriptId: object.scriptId.toString(),
    lineNumber: object.line,
    columnNumber: object.column
  };
  
  var p = {
    location: location,
    name: object.name,
    displayName: object.name,
    inferredName: object.inferredName
    // scopeChain: []
  };
  return p;
};


