$(function () {
  $("th").click(function () {
    if ($(this).html() != 'Info') {
      $("th").removeClass("sorted descending");
      $(this).addClass("sorted descending");
      var path = window.location.pathname.split("/");

      if (typeof path[2] === 'undefined' || path[2] == '') {
        window.location.assign("/scams/1/" + $(this).html().toLowerCase());
      } else {
        window.location.assign("/scams/" + path[2] + "/" + $(this).html().toLowerCase());
      }
    }
  });
});