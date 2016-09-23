function RemoteProxy(config) {
	this.__url = config.url;
	this.__methodSeparator = config.methodSeparator || '.';
	this.addMethods(config.methods || {});
	this.__pendingRequests = [];
	this.__throttledRequest = _.throttle(this.__doBatchRequest, config.throttle || 0, {leading: false});
	this.__promiseConverter = config.promiseConverter;
}

function doRequestServer(requestsData) {
	var requestBody = JSON.stringify({calls: requestsData});
	return new Promise(function(resolve, reject) {
		$.ajax({
			url: this.__url,
			headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
			data: requestBody,
			type: 'POST',
			dataType: 'json',
			xhrFields: {
				withCredentials: true
			},
			success: function(data) {
				resolve(data.results);
			},
			error: function(jqXHR, status, error) {
				reject(status + ': ' + error);
			}
		});
	}.bind(this));
}

RemoteProxy.prototype = {
	__addPendingRequest: function(method, args) {
		var resolver = Promise.defer();
		this.__pendingRequests.push({
			method: method,
			args: args.length === 1 ? args[0] : args,
			resolver: resolver
		});
		this.__throttledRequest();
		return resolver.promise;
	},
	__doBatchRequest: function() {
		if(this.__pendingRequests.length === 0) return;
		var requests = this.__pendingRequests.splice(0, this.__pendingRequests.length);
		console.log('Running ' + requests.length + ' requests in a batch:', requests);

		var requestsData = _.map(requests, function(request){ return {method: request.method, args: request.args}; });
		doRequestServer.call(this, requestsData).then(function(responsesData){
			_.each(responsesData, function(responseData, key){
				var request = requests[key];
				if(responseData.success)
					request.resolver.resolve(responseData.response);
				else
					request.resolver.reject(responseData.message || responseData);
			});
		}).catch(function(error){
			console.error(error);
		});
	},
	__convertObject: function(object, prefix) {
		var proxy = this;
		var converted = {};
		_.each(object, function(value, key, list){
			if(_.isArray(value))
				converted[key] = proxy.__convertObject(_.object(value, []), prefix + key + proxy.__methodSeparator);
			else if(_.isObject(value))
				converted[key] = proxy.__convertObject(value, prefix + key + proxy.__methodSeparator);
			else
			{
				var method = prefix + key;
				converted[key] = function() {
					var promise = proxy.__addPendingRequest(method, arguments);
					proxy.__throttledRequest();
					return proxy.__promiseConverter ? proxy.__promiseConverter(promise, method) : promise;
				};
			}
		});
		return converted;
	},
	call: function(method, args) {
		return this.__addPendingRequest(method, args);
	},
	addMethods: function(methods, prefix){
		_.extend(this, this.__convertObject(methods || {}, prefix || ''));
	},
	createProxy: function(methods, prefix){
		return this.__convertObject(methods, prefix || '')
	}
};
