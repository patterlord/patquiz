var started = false;
var forceStop = function(){
	started = false;
	for(var i = 0; i < users.length; i++){
		if(io.sockets.sockets.has(users[i].socketid)){
			io.sockets.sockets[users[i].socketid].disconnect();
		}
	}
}
var server = require('http').createServer((req, res) => {
	res.statusCode = 200;
	res.setHeader('Content-Type', 'text/html');
	if(started) res.end("A quiz is being played. <button type='button' onclick='forceStop()'>Stop Quiz</button>");
	else  res.end('There is no quiz being played right now.');
});
var io = require('socket.io')(server);
const fs = require('fs');
const path = require('path');

var hostname = '192.168.2.101';
var port = 8080;

const states = {
	CHOOSING: "choosing",
	QUESTION: "question",
	QUESTIONRESULT: "questionresult",
	FINALSCORE: "finalscore"
};

class User{
  constructor(name, socketid){
    this.name = name;
    this.socketid = socketid;
    this.ready = false;
    this.gamemaster = false;
    this.score = 0;
    this.connected = true;
  }
}

class Answer{
  constructor(){
    this.text = "";
    this.correct = true;
    this.givenBy = "";
  }
}

class Question {
  constructor(){
    this.category = "";
    this.text = "";
    this.multipleChoice = false;
    this.closest = false;
    this.answers = new Array();
    this.completed = false;
    this.points = 1;
  }
}

class Quiz {
  constructor(){
    this.name = "";
    this.createdBy = "";
    this.questions = new Array();
    this.chooseQuestion = false;
    this.width = -1;
  }
}

var users = new Array();
var quiz;
var activeQuestion = -1;
var questionNr = 0;
var answers = new Array();
var chooser = -1;
var lastChoosers = new Array();
var state = "";
var correctUsers_ = new Array();

var started = false;

function sampleQuiz(){
  
  quiz = new Quiz();
  quiz.name = "Test Quiz";
  quiz.chooseQuestion = true;
  
  //----------------------
  
  var q = new Question();
  q.category = "default";
  q.text = "Choose?";
  q.multipleChoice = false;
  q.closest = false;
  q.points = 1;
  
  var a = new Answer();
  a.text = "right";
  a.correct = true;
  q.answers.push(a);
  
  quiz.questions.push(q);
  
  //----------------------
  
  q = new Question();
  q.category = "choice";
  q.text = "Choose?";
  q.multipleChoice = true;
  q.closest = false;
  q.points = 1;
  
  a = new Answer();
  a.text = "right";
  a.correct = true;
  q.answers.push(a);
  
  a = new Answer();
  a.text = "false1";
  a.correct = false;
  q.answers.push(a);
  
  a = new Answer();
  a.text = "false2";
  a.correct = false;
  q.answers.push(a);
  
  quiz.questions.push(q);
  
  //-------------------
  
  q = new Question();
  q.category = "closest";
  q.text = "Choose?";
  q.multipleChoice = false;
  q.closest = true;
  q.points = 1;
  
  a = new Answer();
  a.text = "10";
  a.correct = true;
  q.answers.push(a);
  
  quiz.questions.push(q);

}

function loadQuiz(filename){
  try{
    const data_ = fs.readFileSync("quizzes/"+filename);

    var data = data_.toString();
    var arr = data.split('|-|');


    quiz = new Quiz();
    quiz.name = arr.splice(0,1)[0];
    quiz.createdBy = arr.splice(0,1)[0];
    quiz.chooseQuestion = (arr.splice(0,1)[0] == "true" ? true : false);
    quiz.width = parseInt(arr.splice(0,1)[0]);

    var qunr = parseInt(arr.splice(0,1)[0]);
    for(var i = 0; i < qunr; i++){

      var qu = new Question();
      qu.category = arr.splice(0,1)[0];
      qu.text = arr.splice(0,1)[0];
      qu.multipleChoice = (arr.splice(0,1)[0] == "true" ? true : false);
      qu.closest = (arr.splice(0,1)[0] == "true" ? true : false);
      qu.points = parseInt(arr.splice(0,1)[0]);

      var annr = parseInt(arr.splice(0,1)[0]);
      for(var j = 0; j < annr; j++){
        var an = new Answer();
        an.text = arr.splice(0,1)[0];
        an.correct = (arr.splice(0,1)[0] == "true" ? true : false);
        qu.answers.push(an);
      }

      quiz.questions.push(qu);
    }
    return true;
  }catch(err){
    console.error(err);
    return false;
  }
}

function saveQuiz(quiz_){
  
  var out = '';
  
  out += quiz_.name + '|-|';
  out += quiz_.createdBy + '|-|';
  out += quiz_.chooseQuestion + '|-|';
  out += quiz_.width + '|-|';
  
  out += quiz_.questions.length + '|-|';
  for(var i = 0; i < quiz_.questions.length; i++){
    
    out += quiz_.questions[i].category + '|-|';
    out += quiz_.questions[i].text + '|-|';
    out += quiz_.questions[i].multipleChoice + '|-|';
    out += quiz_.questions[i].closest + '|-|';
    out += quiz_.questions[i].points + '|-|';
    
    out += quiz_.questions[i].answers.length + '|-|';
    for(var j = 0; j < quiz_.questions[i].answers.length; j++){
      out += quiz_.questions[i].answers[j].text + '|-|';
      out += quiz_.questions[i].answers[j].correct + '|-|';
    }
    
  }
  
  out += 'end';
  
  fs.writeFile('quizzes/' + quiz_.name + '.txt', out, function(err){
    if(err) throw err;
  });
}

function getUserByID(socketid){
  for(var i = 0; i < users.length; i++){
    if(users[i].socketid == socketid){
      return users[i];
    }
  }
  return null;
}

function getUserByName(name){
  for(var i = 0; i < users.length; i++){
    if(users[i].name == name){
      return users[i];
    }
  }
  return null;
}

function getMaster(){
  for(var i = 0; i < users.length; i++){
    if(users[i].gamemaster){
      return users[i];
    }
  }
  return null;
}

function chooseQuestion(){
  if(!quiz.chooseQuestion){
    nextQuestion(activeQuestion + 1);
  }
  else{
    state = states.CHOOSING;
    for(var i = 0; i < users.length; i++){
      if(users[i].name == chooser){
        io.to(users[i].socketid).emit('choosequestion', quiz.questions, quiz.width);
      }
      else{
        io.to(users[i].socketid).emit('waitforchoose', quiz.questions, quiz.width);
      }
    }
  }
}

function nextQuestion(index){
  
  state = states.QUESTION;
  activeQuestion = index;
  questionNr++;
  quiz.questions[activeQuestion].completed = true;
  answers = new Array();
  
  for(var i = 0; i < users.length; i++){
    if(users[i].connected){
      io.to(users[i].socketid).emit('question', quiz.questions[activeQuestion], questionNr);
    }
  }
}

async function gameMasterStartingScreen(socket){
  var quizzes = new Array();
          
  const files = await fs.promises.readdir("quizzes");
  for(const file of files){
    const Path = path.join("quizzes", file);
    const stat = await fs.promises.stat(Path);
    if(stat.isFile()){
      const done = await loadQuiz(file);
      if(done) {quizzes.push(quiz);}
    }
  }
  
  socket.emit('startingScreen', quizzes);
}

async function quizEditorStartingScreen(socket){
  var quizzes = new Array();
          
  const files = await fs.promises.readdir("quizzes");
  for(const file of files){
    const Path = path.join("quizzes", file);
    const stat = await fs.promises.stat(Path);
    if(stat.isFile()){
      const done = await loadQuiz(file);
      if(done) {quizzes.push(quiz);}
    }
  }
  
  socket.emit('returnquizzes', quizzes);
}

async function deleteQuizzes(){
          
  const files = await fs.promises.readdir("quizzes");
  for(const file of files){
    const Path = path.join("quizzes", file);
    const stat = await fs.promises.stat(Path);
    if(stat.isFile()){
      fs.unlinkSync(Path);
      console.log("deleted " + file);
    }
  }
}

function deleteQuiz(filename){
  fs.unlinkSync('quizzes/'+filename);
  console.log("deleted " + filename);
}

io.sockets.on('connection', function(socket) {
  
  socket.emit('connected');
  
  socket.on('initUser', function(playername, isMaster){
    
    var error = false;
    
    //connect first time
    if(!started){
      //only one master
      if(isMaster && getMaster() == null){
        var user = new User(playername, socket.id);
        user.gamemaster = true;
        users.push(user);
      }else if(isMaster){
        error = true;
      }

      //check username
      if(getUserByName(playername) == null && !isMaster && playername != 'master'){
        var user = new User(playername, socket.id);
        users.push(user);
      }else if(!isMaster){
        error = true;
      }
    }
    
    //reconnect same username
    else{
      //reconnect master
      if(isMaster && !getMaster().connected){
        getMaster().socketid = socket.id;
        getMaster().connected = true;
      }
      else if(isMaster){
        error = true;
      }
      //reconnect user
      if(!isMaster && getUserByName(playername) != null && !getUserByName(playername).connected){
        getUserByName(playername).socketid = socket.id;
        getUserByName(playername).connected = true;
      }else if(!isMaster){
        error = true;
      }
    }
    
    if(!error){
      
      //new connect
      if(!started){
        if(isMaster){
          gameMasterStartingScreen(socket);
        }
        else socket.emit('waitingScreen');
      }
      //reconnect
      else{
        socket.emit('reconnect', quiz.questions[activeQuestion], questionNr, chooser, quiz.questions, answers, users, correctUsers_, quiz.width, state);
      }
      
      if(getMaster() != null && getMaster().connected){
        io.to(getMaster().socketid).emit('setUsers', users);
      }
      
    }else{
      if(!started) socket.emit('usernameGiven');
      else socket.emit('usernameNotGiven');
    }
    
  });
  
  //player
  
  socket.on('login', function(answertext){
    
    var ans = new Answer();
    ans.text = answertext;
    ans.givenBy = getUserByID(socket.id).name;
    answers.push(ans);
    
    if(getMaster().connected){
      io.to(getMaster().socketid).emit('receiveanswer', ans.text, ans.givenBy);
    }
    
  });
  
  socket.on('questionchosen', function(questionIndex){
    
    nextQuestion(questionIndex);
    
  });
  
  //master
  
  socket.on('start', function(quiz_){
            
    quiz = quiz_;
    started = true;
    if(!users[0].gamemaster) chooser = users[0].name;
    else chooser = users[1].name;
    lastChoosers.push(users[0].name);
    if(quiz.questions.length != 0) chooseQuestion();
    
  });
  
  socket.on('nextquestion', function(){
    
    //sort users score
    var index = 0;
    while(index < users.length - 1){
      var newIndex = 0;
      for(var i = 0; i < users.length; i++){
        if(users[i].score > users[index].score) newIndex++;
      }
      if(index == newIndex) index++;
      else{
        var tmp = users[index];
        users[index] = users[newIndex];
        users[newIndex] = tmp;
      }
    }
    
    var questionLeft = false;
    for(var i = 0; i < quiz.questions.length; i++){
      if(!quiz.questions[i].completed){
        questionLeft = true;
        break;
      }
    }
    
    if(questionLeft){
      //determine chooser
      chooser = null;
      var lowestScore = 0;
      if(!users[users.length - 1].gamemaster) lowestScore = users[users.length - 1].score;
      else lowestScore = users[users.length - 2].score;
      var longestNoChoose = -1;
      var pushed = false;
      for(var i = users.length - 1; i >= 0; i--){
        if(!users[i].gamemaster && users[i].score > lowestScore) break;
        if(!users[i].connected || users[i].gamemaster) continue;
        if(!lastChoosers.includes(users[i].name)){
          chooser = users[i].name;
          lastChoosers.push(users[i].name);
          pushed = true;
          break;
        }
        if(longestNoChoose == -1 || lastChoosers.indexOf(users[i].name) < longestNoChoose){
          longestNoChoose = lastChoosers.indexOf(users[i].name);
          chooser = users[i].name;
        }
      }
      if(!pushed){
        var i = lastChoosers.indexOf(chooser);
        lastChoosers.splice(i, 1);
        lastChoosers.push(chooser);
      }
      
      chooseQuestion();
    }
    //end quiz
    else{      
      state = states.FINALSCORE;
      for(var i = 0; i < users.length; i++){
        if(users[i].connected){
          io.to(users[i].socketid).emit('finalscore', users);
        }
      }
    }
    
  });
  
  socket.on('endquestion', function(correctUsers){
    
    state = states.QUESTIONRESULT;
    correctUsers_ = correctUsers;
    
    var userchosencorrect = false;
    for(var i = 0; i < correctUsers.length; i++){
      for(var j = 0; j < users.length; j++){
        if(users[j].name == correctUsers[i].name){
          if(quiz.chooseQuestion && users[j].name == chooser) userchosencorrect = true;
          if(quiz.chooseQuestion && users[j].name == chooser) users[j].score += 1.5 * quiz.questions[activeQuestion].points;
          else users[j].score += quiz.questions[activeQuestion].points;
          break;
        }
      }
    }
    if(quiz.chooseQuestion && !userchosencorrect){
      for(var i = 0; i < users.length; i++){
        if(users[i].name == chooser){
          users[i].score -= 0.5 * quiz.questions[activeQuestion].points;
          break;
        }
      }
    }
    
    if(getMaster().connected){
      io.to(getMaster().socketid).emit('setUsers', users);
    }
    
    for(var i = 0; i < users.length; i++){
      if(users[i].connected && !users[i].gamemaster){
        io.to(users[i].socketid).emit('questionresult', answers, correctUsers);
      }
    }
    
  });
  
  socket.on('dodisconnect', function(){
	 socket.disconnect(); 
  });
  
  socket.on('disconnect', (reason) => {
    
    if(getUserByID(socket.id) == null) return;
    console.log("disconnect: " + getUserByID(socket.id).name);
    
    //delete users
    if(!started){
      users.splice(users.indexOf(getUserByID(socket.id)), 1);
    }
    //keep users
    else{
      getUserByID(socket.id).connected = false;
    }

    if(getMaster() != null && getMaster().connected){
      io.to(getMaster().socketid).emit('setUsers', users);
    }
  });
  
  //quiz editor
  
  socket.on('getquizzes', function(){
    quizEditorStartingScreen(socket);
  });
  
  socket.on('deletequiz', function(quizname){
    deleteQuiz(quizname+'.txt');
  });
  
  socket.on('checkfile', function(filename, createdBy){
    if(!started){
     fs.access('quizzes/' + filename, fs.constants.F_OK, (err) => {
       if(err) socket.emit('checkedfile', true, false); // not exist -> permission
       else { // exist
         loadQuiz(filename);
         if(quiz.createdBy == createdBy) socket.emit('checkedfile', false, false); // permission
         else socket.emit('checkedfile', false, true); // no permission, created by other
       }
     });
    }
    else{
      socket.emit('error', 'You cannot upload a quiz, if a quiz is currently being played.');
    }
  });
  
  socket.on('savefile', function(quiz_){
    if(!started){
      saveQuiz(quiz_);
    }
    else{
      socket.emit('error', 'You cannot upload a quiz, if a quiz is currently being played.');
    }
  });
  
});


//deleteQuizzes();
console.log('server started.');
//server.listen(port);
server.listen(port, hostname, () => {
  console.log('Server running at http://'+hostname+':'+port+'/');
});