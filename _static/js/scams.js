$(function () {
  $('thead').on('click', 'th', function(e){
    var target = $(e.target)
    var data = target.data('name')
    var direction = target.data('direction')

    if (data) {
      var path = window.location.pathname.split('/')

      direction = direction === 'ascending' ? 'descending' : 'ascending'

      if (typeof path[2] === 'undefined') {
        window.location.assign('/scams/1/' + data + '/' + direction)
      } else {
        window.location.assign('/scams/' + path[2] + '/' + data + '/' + direction)
      }
    }
  })
})