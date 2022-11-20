<?php
/*
###################################################################################################
################ useful PHP cURL function [ auto-follows recursive redirections ] #################
###############$### ( source: https://github.com/ttodua/useful-php-scripts ) ###################### 
###################################################################################################
###################################################################################################
### echo get_remote_data("http://example.com/");                                   // GET
### echo get_remote_data("http://example.com/", "var2=something&var3=blabla" );    // POST	 
###################################################################################################
*/ 

function get_remote_data($url, $post_paramtrs=false,  $curl_opts=[])	
{ 
	$c = curl_init(); 
	curl_setopt($c, CURLOPT_URL, $url);
	curl_setopt($c, CURLOPT_RETURNTRANSFER, 1);
	//if parameters were passed to this function, then transform into POST method.. (if you need GET request, then simply change the passed URL)
	if($post_paramtrs){ curl_setopt($c, CURLOPT_POST,TRUE);  curl_setopt($c, CURLOPT_POSTFIELDS, (is_array($post_paramtrs)? http_build_query($post_paramtrs) : $post_paramtrs) ); }
	curl_setopt($c, CURLOPT_SSL_VERIFYHOST,false); 
	curl_setopt($c, CURLOPT_SSL_VERIFYPEER,false);
	curl_setopt($c, CURLOPT_COOKIE, 'CookieName1=Value;'); 
		$headers[]= "User-Agent: Mozilla/5.0 (Windows NT 6.1; rv:76.0) Gecko/20100101 Firefox/76.0";	 $headers[]= "Pragma: ";  $headers[]= "Cache-Control: max-age=0";
		if (!empty($post_paramtrs) && !is_array($post_paramtrs) && is_object(json_decode($post_paramtrs))){ $headers[]= 'Content-Type: application/json'; $headers[]= 'Content-Length: '.strlen($post_paramtrs); }
	curl_setopt($c, CURLOPT_HTTPHEADER, $headers);
	curl_setopt($c, CURLOPT_MAXREDIRS, 10); 
	//if SAFE_MODE or OPEN_BASEDIR is set,then FollowLocation cant be used.. so...
	$follow_allowed= ( ini_get('open_basedir') || ini_get('safe_mode')) ? false:true;  if ($follow_allowed){curl_setopt($c, CURLOPT_FOLLOWLOCATION, 1);}
	curl_setopt($c, CURLOPT_CONNECTTIMEOUT, 9);
	curl_setopt($c, CURLOPT_REFERER, $url);    
	curl_setopt($c, CURLOPT_TIMEOUT, 60);
	curl_setopt($c, CURLOPT_AUTOREFERER, true);
	curl_setopt($c, CURLOPT_ENCODING, '');
	curl_setopt($c, CURLOPT_HEADER, !empty($extra['return_array']));
	//set extra options if passed
	if(!empty($curl_opts)) foreach($curl_opts as $key=>$value) curl_setopt($c, constant($key), $value);
	$data = curl_exec($c);
	if(!empty($extra['return_array'])) { 
		 preg_match("/(.*?)\r\n\r\n((?!HTTP\/\d\.\d).*)/si",$data, $x); preg_match_all('/(.*?): (.*?)\r\n/i', trim('head_line: '.$x[1]), $headers_, PREG_SET_ORDER); foreach($headers_ as $each){ $header[$each[1]] = $each[2]; }   $data=trim($x[2]); 
	}
	$status=curl_getinfo($c); curl_close($c);
	// if redirected, then get that redirected page
	if($status['http_code']==301 || $status['http_code']==302) { 
		//if we FOLLOWLOCATION was not allowed, then re-get REDIRECTED URL
		//p.s. WE dont need "else", because if FOLLOWLOCATION was allowed, then we wouldnt have come to this place, because 301 could already auto-followed by curl  :)
		if (!$follow_allowed){
			//if REDIRECT URL is found in HEADER
			if(empty($redirURL)){if(!empty($status['redirect_url'])){$redirURL=$status['redirect_url'];}}
			//if REDIRECT URL is found in RESPONSE
			if(empty($redirURL)){preg_match('/(Location:|URI:)(.*?)(\r|\n)/si', $data, $m);	                if (!empty($m[2])){ $redirURL=$m[2]; } }
			//if REDIRECT URL is found in OUTPUT
			if(empty($redirURL)){preg_match('/moved\s\<a(.*?)href\=\"(.*?)\"(.*?)here\<\/a\>/si',$data,$m); if (!empty($m[1])){ $redirURL=$m[1]; } }
			//if URL found, then re-use this function again, for the found url
			if(!empty($redirURL)){$t=debug_backtrace(); return call_user_func( $t[0]["function"], trim($redirURL), $post_paramtrs);}
		}
	}
	// if not redirected,and nor "status 200" page, then error..
	elseif ( $status['http_code'] != 200 ) { $data =  "ERRORCODE22 with $url<br/><br/>Last status codes:".json_encode($status)."<br/><br/>Last data got:$data";}
	//URLS correction
	$answer = ( !empty($extra['return_array']) ? array('data'=>$data, 'header'=>$header, 'info'=>$status) : $data);
	return $answer;      
} 
?>
<?php
	$str_data = file_get_contents('/home/dietpi/.mupibox/Sonos-Kids-Controller-master/server/config/data.json', true);
	$data_json = json_decode($str_data, true);
	include ('includes/header.php');
?>
<div class="main">
<h2>MuPiBox - Media</h2>
<p>Coming soon...</p>
</div>
<?php
	foreach($data_json as $all_media)
		{
			if( $all_media['type'] == "spotify" )
				{
				if( $all_media['artistid'] != "" )
					{
					$url2media = "https://open.spotify.com/oembed?url=http://open.spotify.com/artist/".$all_media['artistid'];
					}
				if( $all_media['id'] != "" )
					{
					if( $all_media['category'] == "playlist" )
						{
						$url2media = "https://open.spotify.com/oembed?url=http://open.spotify.com/playlist/".$all_media['artistid'];
						}
					if( $all_media['category'] == "music" )
						{
						$url2media = "https://open.spotify.com/oembed?url=http://open.spotify.com/album/".$all_media['artistid'];
						}
					}
				if( $all_media['showid'] != "" )
					{
					$url2media = "https://open.spotify.com/oembed?url=http://open.spotify.com/show/".$all_media['artistid'];
					}
				if( $all_media['query'] != "" )
					{
					$url2media = "https://open.spotify.com/oembed?url=http://open.spotify.com/query/".$all_media['artistid'];
					}
				$str_mediadata = get_remote_data($url2media);
				$data_mediajson = json_decode($str_mediadata, true);
				$img_http = "<img style='max-width:120px;' src='" . $data_mediajson['thumbnail_url'] . "'>";
				spotiy_artist = $data_mediajson['title'];
				}

			print "<div style='margin-left:30px;margin-bottom:20px;margin-left:30px;'>";
			print "<table><tr><td>";
			if( $all_media['type'] == "library" )
				{
				print "<img style='max-width:120px;' src='" . $all_media['cover'] . "'>";
				}
			if( $all_media['type'] == "radio" )
				{
				print "<img style='max-width:120px;' src='" . $all_media['cover'] . "'>";
				}
			if( $all_media['type'] == "spotify" )
				{
				print $img_http;
				}
			print "</td><td width='75%' style='padding:10px;'>";
			print "Index: " . $all_media['index'] . "<br>";
			print "Type: " . $all_media['type'] . "<br>";
			print "Category: " . $all_media['category'] . "<br>";
			print "Artist: " . $all_media['artist'] . "<br>";
			print "Title: " . $all_media['title'] . "<br>";
			print "Shuffle: " . $all_media['shuffle'] . "<br>";
			//print "URL: " . $all_media['type'] . "<br>";

			print "</td></tr></table></div><hr>";
		}
?>

</div>

<?php
 include ('includes/footer.php');
?>
