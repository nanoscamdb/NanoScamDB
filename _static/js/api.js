$(function () {
  $.get("/api/check/xrb_3t6k35gi95xu6tergt6p69ck76ogmitsa8mnijtpxm9fkcm736xtoncuohr3", function (data) {
    data = JSON.stringify(JSON.parse(data), null, 2);
    $("#check_loader").remove();
    $("#check_segment").css("overflow", "scroll");
    $(".check_response").html(data);
  });

  $.get("/api/scams/", function (data) {
    data = JSON.stringify(JSON.parse(data), null, 2);
    $("#scams_loader").remove();
    $("#scams_segment").css("overflow", "scroll");
    $(".scams_response").html(data);
  });

  $.get("/api/addresses/", function (data) {
    data = JSON.stringify(JSON.parse(data), null, 2);
    $("#addresses_loader").remove();
    $("#addresses_segment").css("overflow", "scroll");
    $(".addresses_response").html(data);
  });

  $.get("/api/ips/", function (data) {
    data = JSON.stringify(JSON.parse(data), null, 2);
    $("#ips_loader").remove();
    $("#ips_segment").css("overflow", "scroll");
    $(".ips_response").html(data);
  });

  $.get("/api/verified/", function (data) {
    data = JSON.stringify(JSON.parse(data), null, 2);
    $("#verified_loader").remove();
    $("#verified_segment").css("overflow", "scroll");
    $(".verified_response").html(data);
  });

  $.get("/api/blacklist/", function (data) {
    data = JSON.stringify(JSON.parse(data), null, 2);
    $("#blacklist_loader").remove();
    $("#blacklist_segment").css("overflow", "scroll");
    $(".blacklist_response").html(data);
  });

  $.get("/api/whitelist/", function (data) {
    data = JSON.stringify(JSON.parse(data), null, 2);
    $("#whitelist_loader").remove();
    $("#whitelist_segment").css("overflow", "scroll");
    $(".whitelist_response").html(data);
  });

  $.get("/api/abusereport/changellyli.com", function (data) {
    data = JSON.stringify(JSON.parse(data), null, 2);
    $("#abusereport_loader").remove();
    $("#abusereport_segment").css("overflow", "scroll");
    $(".abusereport_response").html(data);
  });
});