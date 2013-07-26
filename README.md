# ConcurixJS
Node.js Real-time Visual Profiler and Debugger

Moore's Law delivers more cores every year, but subtle chokepoints keep many applications from fully exploiting many-core chips.  Concurix builds trace analysis and visualization tools that make it easy for developers to pinpoint bottlenecks and uncork parallelism. We aim to deliver 10x or better price-performance gains to servers, data centers, and all other many-core systems.

This concurixjs runtime includes a the realtime tracer and debugger for NodeJS.  These tools help Node.js developers in both day to day development as well as tracking down hard to find performance problems.  

For more information, visit [www.concurix.com](http://www.concurix.com).


## Installation
    $ npm install -g concurixjs

## Quick Start
1. Include the following snippet before any other ``require`` statement:

 ```js
 var concurixjs = require('concurixjs')();
 concurixjs.start();
 ```

2. Run your app
 
 ```
 $ node --expose-debug-as=v8debug app.js
 ```

3. Visit [www.concurix.com/bench](http://www.concurix.com/bench) -> *Guest Project for Localhost* -> *Connect to realtime dashboard* to view performance graphs.

Note that, by default, the online dashboard will try to connect  to ``http://localhost``. If you'd like to use anything other than ``localhost`` you should sign up for concurix.com and create your custom project.