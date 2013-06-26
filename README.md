# ConcurixJS
Node.js Real-time Visual Profiler

Moore's Law delivers more cores every year, but subtle chokepoints keep many applications from fully exploiting many-core chips.  Concurix builds trace analysis and visualization tools that make it easy for developers to pinpoint bottlenecks and uncork parallelism. We aim to deliver 10x or better price-performance gains to servers, data centers, and all other many-core systems.

We will be releasing the results of our work to the open source community and as Concurix products.   This product helps Node.js developers to trace, visualize, and locate line-by-line software bottlenecks in their code.

For more information, visit [www.concurix.com](http://www.concurix.com).


## Installation
    $ npm install -g concurixjs

## Quick Start
1. Include the following snippet before any other ``require`` statement:

 ```js
 var tracer = require('concurix').tracer();
 ```

2. Run your app
 
 ```$ node --expose-debug-as=v8debug app.js```

3. Visit [www.concurix.com/bench](http://www.concurix.com/bench) -> *Guest Project for Localhost* -> *Connect to realtime dashboard* to view performance graphs.

Note that, by default, the online dashboard will try to connect  to ``http://localhost``. If you'd like to use anything other than ``localhost`` you should sign up for concurix.com and create your custom project.