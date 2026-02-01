vcl 4.1;

backend imgproxy {
    .host = "imgproxy";
    .port = "8080";
}

sub vcl_recv {
    # 只缓存图片请求
    if (req.url ~ "^/insecure/" || req.url ~ "^/signature/") {
        return (hash);
    }
    return (pass);
}

sub vcl_backend_response {
    # 图片缓存 7 天
    if (beresp.http.content-type ~ "image/") {
        set beresp.ttl = 7d;
        set beresp.grace = 1d;
        unset beresp.http.set-cookie;
    }
}

sub vcl_deliver {
    # 添加缓存命中标识
    if (obj.hits > 0) {
        set resp.http.X-Cache = "HIT";
    } else {
        set resp.http.X-Cache = "MISS";
    }
}
