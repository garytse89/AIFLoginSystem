/**
 * NoobHub node.js server
 * Opensource multiplayer and network messaging for CoronaSDK
 *
 * @usage node node.js
 * configure port number and buffer size
 * according to your needs
 *
 * @authors
 * Igor Korsakov
 * Sergii Tsegelnyk
 *
 * @license WTFPL
 * https://github.com/Overtorment/NoobHub
 */

// account manager
var AM = require('./node-login/app/server/modules/account-manager');            

// noobhub
var server = require('net').createServer()
    , sockets = {}  // this is where we store all current client socket connections
    , cfg = {
        port: 1337,
        buffer_size: 1024*8, // buffer is allocated per each socket client
        verbose: true
    }
    , _log = function(){
        if (cfg.verbose) console.log.apply(console, arguments);
    };

// black magic
process.on('uncaughtException', function(err){
    _log('Exception: ' + err);
});

server.on('connection', function(socket) {
    socket.setNoDelay(true);
    socket.connection_id = require('crypto').createHash('sha1').update( 'noobhub'  + Date.now() + Math.random() ).digest('hex') ; // unique sha1 hash generation
    socket.channel = '';
    socket.buffer = new Buffer(cfg.buffer_size);
    socket.buffer.len = 0; // due to Buffer's nature we have to keep track of buffer contents ourself

    _log('New client: ' + socket.remoteAddress +':'+ socket.remotePort);

    socket.on('data', function(data_raw) { // data_raw is an instance of Buffer as well

	 
        if (data_raw.length > (cfg.buffer_size - socket.buffer.len)) {
            _log("Message doesn't fit the buffer. Adjust the buffer size in configuration");
            socket.buffer.len = 0; // trimming buffer
            return false;
        }

        socket.buffer.len +=  data_raw.copy(socket.buffer, socket.buffer.len); // keeping track of how much data we have in buffer

        var str, start, end
            , conn_id = socket.connection_id;
        str = socket.buffer.slice(0,socket.buffer.len).toString();

        if ( (start = str.indexOf("__SUBSCRIBE__")) !=  -1   &&   (end = str.indexOf("__ENDSUBSCRIBE__"))  !=  -1) {
            socket.channel = str.substr( start+13,  end-(start+13) );
            socket.write('Hello. Noobhub online. \r\n');
            _log("Client subscribes for channel: " + socket.channel);
            str = str.substr(end + 16);  // cut the message and remove the precedant part of the buffer since it can't be processed
            socket.buffer.len = socket.buffer.write(str, 0);
            sockets[socket.channel] = sockets[socket.channel] || {}; // hashmap of sockets  subscribed to the same channel
            sockets[socket.channel][conn_id] = socket;
        }



        var time_to_exit = true;
        do {  // this is for a case when several messages arrived in buffer
            if ( (start = str.indexOf("__JSON__START__")) !=  -1   &&  (end = str.indexOf("__JSON__END__"))  !=  -1 ) {
                var json = str.substr( start+15,  end-(start+15) );
                _log("Client posts json:  " + json);
		
        		var jsonObj = JSON.parse(json);
        	    
                // Write code below for each jsonObj.action
       		
                if (jsonObj.action == "get_credentials") {
                    // some AM function to look up database
                    AM.getCredentials( jsonObj["username"], 
                        function(e, o) {
                            if(!e) {
                                console.log(o);
                                console.log("Something messed up badly when trying to get credentials.");
                            } else { // 'o' contains the credentials you want
                                var credentials = {
                                    "action":"get_credentials_success",
                                    "username": e.user,
                                    "email": e.email,
                                    "country": e.country,
                                };
                                // pack it up and send it back to the client
                                message = JSON.stringify(credentials)
                                socket.write("__JSON__START__" + message + "__JSON__END__");
                            }
                        }
                    ); // weird syntax habit
                }

        		if (jsonObj.action == "login") {
                    console.log("MongoDB looks for this account: " + jsonObj["username"], jsonObj["password"]);
                    AM.manualLogin( jsonObj["username"], jsonObj["password"],
                        function (e, o) {
                            if (!o) {
                                //res.send(e, 400);
                                console.log("error calling AM.manualLogin in nodeserver.js :" + e);
                                if (e == 'user-not-found') {
                                    var message = {
                                        "action":"Login_fails_on_user"
                                    };
                                } else if (e == 'invalid-password') {
                                    var message = {
                                        "action":"Login_fails_on_pass"
                                    };
                                }
                            } else {
                                //res.send('ok', 200);
                                console.log("Login success");
                                var message = {
                                    "action":"Login_success",
                                    "avatar":o.avatar,
                                    "email":o.email
                                };
                            }
                        
                            message = JSON.stringify(message);
                            socket.write("__JSON__START__" + message + "__JSON__END__");
                        }
                    );
                } 			

        	    str = str.substr(end + 13);  // cut the message and remove the precedant part of the buffer since it can't be processed
                socket.buffer.len = socket.buffer.write(str, 0);
                for (var prop in sockets[socket.channel]) {
                    if (sockets[socket.channel].hasOwnProperty(prop)) {
                        sockets[socket.channel][prop].write("__JSON__START__" + json + "__JSON__END__");
                    }
                } // writing this message to all sockets with the same channel

                time_to_exit = false;

            } else {  time_to_exit = true; } // if no json data found in buffer - then it is time to exit this loop
        
        } while ( !time_to_exit ); // end of big do-while loop starting from line 74

    }); // end of  socket.on 'data'

    socket.on('close', function(){  // we need to cut out closed socket from array of client socket connections
        if  (!socket.channel   ||   !sockets[socket.channel])  return;
        delete sockets[socket.channel][socket.connection_id];
        _log(socket.connection_id + " has been disconnected from channel " + socket.channel);
    }); // end of socket.on 'close'

}); //  end of server.on 'connection'

server.on('listening', function(){ console.log('NoobHub on ' + server.address().address +':'+ server.address().port); });
server.listen(cfg.port);