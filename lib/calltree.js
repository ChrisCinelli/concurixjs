
exports.createOrFindNode = createOrFindNode;
exports.createOrUpdateNode = createOrUpdateNode;
exports.createOrUpdateLink = createOrUpdateLink;
exports.reset = reset;
exports.getNodes = getNodes;
exports.getLinks = getLinks;

var links = {};
var nodes = {};

function reset(){
  links = {};
  nodes = {};
}

function getNodes(){
  return nodes;
}

function getLinks(){
  return links;
}

function traceToName(trace){
  return [trace.pid, trace.id].join(':');
}

function createOrFindNode(trace){
  var name = traceToName(trace);
  if(!nodes[name]){
    nodes[name] = trace;
    trace.name = name;
  }
  return nodes[name];
}

function createOrUpdateNode(trace){
  var node = createOrFindNode(trace);
  if (!node.num_calls){
    node.num_calls = 1;
    node.duration = trace.duration;
    node.mem_delta = trace.mem_delta;
    node.nest_level = trace.nest_level;
  } else {
    node.nest_level = Math.floor(((node.nest_level * node.num_calls) + trace.nest_level) / (node.num_calls + 1));
    node.num_calls += 1;
    node.duration += trace.duration;
    node.mem_delta += trace.mem_delta;
  }
  return node;
}

function createOrUpdateLink(src, trg, type, trace){
  var srcName = src.name;
  var trgName = trg.name;
  var key = [srcName, trgName, type].join('-');
  var lnk = links[key];
  if(!lnk){
    lnk = links[key] = {
      source: srcName,
      target: trgName,
      type: type,
      num_calls: 0,
      total_delay: 0
    }
  }
  lnk.num_calls++;

  if( lnk.type == 'callback'){
    lnk.total_delay += trace.start - trace.callbackOf.start;
  } else {
    lnk.total_delay += trace.start - trace.calledBy.start;
  }

  return lnk;
}
