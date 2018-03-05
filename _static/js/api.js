$(function () {
  var str = function(data) {
    return JSON.stringify(data, null, 2)
  }
  $.get("/api/check/xrb_3t6k35gi95xu6tergt6p69ck76ogmitsa8mnijtpxm9fkcm736xtoncuohr3", function (data) {
    $("#check_loader").remove();
    $("#check_segment").css("overflow", "scroll");
    $(".check_response").html(str(data));
  });

  $.get("/api/scams/", function (data) {
    $("#scams_loader").remove();
    $("#scams_segment").css("overflow", "scroll");
    $(".scams_response").html(str(data));
  });

  $.get("/api/addresses/", function (data) {
    $("#addresses_loader").remove();
    $("#addresses_segment").css("overflow", "scroll");
    $(".addresses_response").html(str(data));
  });

  $.get("/api/ips/", function (data) {
    $("#ips_loader").remove();
    $("#ips_segment").css("overflow", "scroll");
    $(".ips_response").html(str(data));
  });

  $.get("/api/verified/", function (data) {
    $("#verified_loader").remove();
    $("#verified_segment").css("overflow", "scroll");
    $(".verified_response").html(str(data));
  });

  $.get("/api/blacklist/", function (data) {
    $("#blacklist_loader").remove();
    $("#blacklist_segment").css("overflow", "scroll");
    $(".blacklist_response").html(str(data));
  });

  $.get("/api/whitelist/", function (data) {
    $("#whitelist_loader").remove();
    $("#whitelist_segment").css("overflow", "scroll");
    $(".whitelist_response").html(str(data));
  });

  $.get("/api/abusereport/changellyli.com", function (data) {
    $("#abusereport_loader").remove();
    $("#abusereport_segment").css("overflow", "scroll");
    $(".abusereport_response").html(str(data));
  });
});