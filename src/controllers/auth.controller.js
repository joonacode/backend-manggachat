const User = require('../models/user.model')
const Member = require('../models/member.model')
const Friend = require('../models/friend.model')
const Message = require('../models/message.model')
const Room = require('../models/room.model')
const helpers = require('../helpers/index')
const bcrypt = require('bcrypt')
const saltRounds = 12
const Token = require('../models/token.model')
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid');

const authController = {
  login: (req, res) => {
    const {
      email,
      password
    } = req.body
      User.login(email)
      .then((response) => {
        const user = response[0]
        if (user.statusAccount === 0) return helpers.response(res, 404, null, 'Your account has not been activated, please check your email to activate', true)
        bcrypt.compare(password, user.password, async function (err, result) {
          if (result) {
            var token = jwt.sign({
                data: user.id,
              },
              process.env.PRIVATE_KEY, {
                expiresIn: '5h',
              },
            )
            const newResponse = {
              idUser: user.id,
              token
            }
            try{
              await User.updateUser({statusOnline: 1}, user.id)
            }catch(err){
              console.log(err)
            }
            helpers.response(
              res,
              res.statusCode,
              newResponse,
              'Login success'
            )
          } else {
            helpers.response(res, 400, null, 'Wrong email or password', true)
          }
        })
      })
      .catch((error) => {
        console.log('Sini')
        helpers.response(res, 400, null, 'Wrong email or password', true)
      })
  },
  register: (req, res) => {
    const {
      name,
      email,
      password
    } = req.body

    bcrypt.hash(password, saltRounds, function (err, hash) {
      const newUser = {
        id: uuidv4(),
        name,
        email: email.toLowerCase(),
        password: hash,
        bio: `Bio Saya Belum Diubah :D`
      }
      User.signup(newUser).then((response) => {
        const token = jwt.sign(
          { data: response.insertId },
          process.env.PRIVATE_KEY,
          { expiresIn: '3h' },
        )
        const mailMessage = `${process.env.BASE_URL_ACTIVATE}?token=${token}`
          helpers.transporter(mailMessage, email, 'Activate Account Mangga Chat', 'signup', () => {
            User.getUserByEmail(email).then(responseEmail => {
              responseEmail = responseEmail[0]
              Token.sendToken(
                {
                  token,
                  idUser: responseEmail.id,
                  type: 1
                }
              ).then((resToken) => console.log(`Token send to ${email}`)).catch(err => console.log(err))
              delete responseEmail.password
              helpers.response(
                res,
                res.statusCode,
                responseEmail,
                helpers.status.insert
              )
            })
          })
        })
        .catch((error) => {
          helpers.response(res, 400, null, error, true)
        })
    })
  },
  activateAccount: (req, res) => {
    const token = req.body.token
    if (!token) return helpers.response(res, 400, null, 'No token provided', true)
    Token.findToken(token).then(async response => {
      const {
        token,
        idUser,
        type
      } = response[0]
      if (type !== 1) return helpers.response(res, 400, null, 'Wrong token', true)
      jwt.verify(token, process.env.PRIVATE_KEY, async function (err, decoded) {
        if (err) {
          if (err.name === 'JsonWebTokenError') {
            return helpers.response(res, 401, null, 'Token invalid', true)
          } else if (err.name === 'TokenExpiredError') {
            Token.deleteToken(token)
              .then(deleteResponse => console.log('token deleted'))
              .catch(err => console.log(err))
            User.deleteUser(idUser)
              .then(deleteUsrResponse => console.log('usr deleted'))
              .catch(err => console.log(err))
            return helpers.response(res, 401, null, 'Token expired, please register again', true)
          } else {
            return helpers.response(res, 401, null, err, true)
          }
        } else {
          try{
            await Token.activateAccount(idUser)
            await Token.deleteToken(token)
            const responseRoomGlobal = await Room.findRoom('Public')
            const dataGlobal = responseRoomGlobal[0]
            console.log(responseRoomGlobal)
            const dataMember = {
              idRoom: dataGlobal.idRoom,
              idUser: idUser,
              status: 2
            }
            await Member.addMember(dataMember)
            const joinMessage = {
              message: `Join Room`,
              type: 7,
              idRoom: dataGlobal.idRoom,
              idUser: idUser
            }
            await Message.sendMessage(joinMessage)
            const data1 = {
              idUser: process.env.USER_ROOT,
              idFriend: idUser,
              idSender: process.env.USER_ROOT,
              status: 1
            }
            const data2 = {
              idUser: idUser,
              idFriend: process.env.USER_ROOT,
              idSender: process.env.USER_ROOT,
              status: 1
            }
            await Friend.addFriend(data1)
            await Friend.addFriend(data2)
            const roomName = Math.random().toString(36).substring(7);
            const dataRoomPrivate = {
              idRoom: uuidv4(),
              name: roomName,
              idSender: process.env.USER_ROOT,
              idReceiver: idUser,
              type: 1
            }
            const response = await Room.addRoomPublic(dataRoomPrivate)
            console.log(response)
            const responseRoom = await Room.getRoomById(response.insertId)
            const detailRoom = responseRoom[0]
            const dataMember1 = {
              idRoom: detailRoom.idRoom,
              idUser: process.env.USER_ROOT,
              status: 1
            }
            const dataMember2 = {
              idRoom: detailRoom.idRoom,
              idUser: idUser,
              status: 1
            }
            await Member.addMember(dataMember1)
            await Member.addMember(dataMember2)
            const messageAcc = {
              message: `Hai..👋️, Selamat datang di 🍋️Mangga Chat jika kamu menemukan bug atau ada saran fitur tambahan bisa share di chat sini ya 😁️`,
              type: 1,
              idRoom: detailRoom.idRoom,
              idUser: process.env.USER_ROOT
            }
            await Message.sendMessage(messageAcc)
            helpers.response( res, 200, ['ok'], 'Account successfully activate')
          }catch(error) {
            console.log(error)
            return helpers.response(res, 400, null, error, true)
          }
        }
      })
    }).catch(err => {
      helpers.response(res, 401, null, 'Wrong token', true)
    })
  },
  reqResetPassword: (req, res) => {
    const {
      email
    } = req.body

    User.getUserByEmail(email)
      .then((response) => {
        const resultUser = response[0]
        if(resultUser.statusAccount !== 1) return helpers.response(res, 400, [],  'Your account has not been activated, please check your email to activate', true)
        Token.checkTokenExist(resultUser.id, 2).then((resToken) => {
          if(resToken.length > 0){
            return helpers.response(res, 400, [],  'The link to change the password has been sent to your email.', true)
          }else{
            const token = jwt.sign({
              data: email,
            },
            process.env.PRIVATE_KEY, {
              expiresIn: '3h',
            })
            const mailMessage = `${process.env.BASE_URL_RESET_PASSWORD}?token=${token}`
            helpers.transporter(mailMessage, email, 'Reset Password Mangga Chat', 'reset', () => {
              User.getUserByEmail(email)
                .then((responseUser) => {
                  responseUser = responseUser[0]
                  delete responseUser.password
                  Token.sendToken({
                      token,
                      idUser: responseUser.id,
                      type: 2
                    })
                    .then((resToken) => console.log(`Token send to ${email}`))
                  helpers.response(
                    res,
                    res.statusCode,
                    [email],
                    'Token successfully sent'
                  )
                })
                .catch((err) => {
                  helpers.response(res, 400, [], err, true)
                })
              })
            }
          })
          .catch((errToken) => {
            helpers.response(res, 400, [], errToken, true)
          })
      })
      .catch((err) => {
        helpers.response(res, 400, [], err, true)
      })
  },
  verifyResetPassword: (req, res) => {
    const token = req.body.token
    if (!token) return helpers.response(res, 400, [], 'No token provided', true)
    Token.findToken(token).then(response => {
      const {
        token,
        userId,
        type
      } = response[0]
      if (type !== 2) return helpers.response(res, 400, [], 'Wrong Token', true)
      jwt.verify(token, process.env.PRIVATE_KEY, function (err, decoded) {
        if (err) {
          if (err.name === 'JsonWebTokenError') {
            return helpers.response(res, 401, [], 'Token invalid', true)
          } else if (err.name === 'TokenExpiredError') {
            Token.deleteToken(token).then(deleteResponse => console.log('token deleted'))
            return helpers.response(res, 401, [], 'Token expired, please request reset password again', true)
          } else {
            return helpers.response(res, 401, [], err, true)
          }
        } else {
          helpers.response(res, 200, ['ok'], 'Request reset password ok')
        }
      })
    }).catch(err => {
      helpers.response(res, 400, [], 'Wrong token', true)
    })
  },
  resetPassword: (req, res) => {
    const {
      password,
      token
    } = req.body
    if (!token) return helpers.response(res, 400, [], 'No token provided', true)
    Token.findToken(token).then(response => {
      const {
        token,
        idUser,
        type
      } = response[0]
      if (type !== 2) return helpers.response(res, 400, [], 'Wrong token', true)
      jwt.verify(token, process.env.PRIVATE_KEY, function (err, decoded) {
        if (err) {
          if (err.name === 'JsonWebTokenError') {
            return helpers.response(res, 401, [], 'Token invalid', true)
          } else if (err.name === 'TokenExpiredError') {
            Token.deleteToken(token).then(deleteResponse => console.log('token deleted'))
            return helpers.response(res, 401, [], 'Token expired, please request reset password again', true)
          } else {
            return helpers.response(res, 401, [], err, true)
          }
        } else {
          bcrypt.genSalt(saltRounds, function (err, salt) {
            bcrypt.hash(password, salt, function (err, hash) {
              User.updateUser({
                  password: hash
                }, idUser)
                .then(responseUser => {
                  Token.deleteToken(token).then(deleteResponse => console.log('token deleted'))
                  helpers.response(res, 200, ['ok'], 'Password updated')
                }).catch(err => {
                  helpers.response(res, 400, [], err, true)
                })
            })
          })
        }
      })
    }).catch(err => {
      helpers.response(res, 400, [], 'Wrong token', true)
    })

  },
}

module.exports = authController